import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);

	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return false;
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return true;
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
}

function getDateRange(period: string, startDate?: string, endDate?: string): { start: string; end: string } {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const date = now.getDate();

	let start: Date;
	let end: Date = new Date(now);
	end.setHours(23, 59, 59, 999);

	switch (period) {
		case 'today':
			start = new Date(year, month, date);
			break;
		case 'week':
			start = new Date(year, month, date - now.getDay());
			break;
		case 'month':
			start = new Date(year, month, 1);
			break;
		case 'year':
			start = new Date(year, 0, 1);
			break;
		case 'custom':
			if (!startDate || !endDate) {
				start = new Date(0);
			} else {
				start = new Date(startDate);
				end = new Date(endDate);
				end.setHours(23, 59, 59, 999);
			}
			break;
		default:
			start = new Date(0);
			end = new Date();
			end.setHours(23, 59, 59, 999);
	}

	return {
		start: start.toISOString(),
		end: end.toISOString()
	};
}

function convertToCSV(data: any[]): string {
	if (data.length === 0) return '';

	const headers = Object.keys(data[0]);
	const csvHeaders = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

	const csvRows = data.map(row =>
		headers.map(header => {
			const value = row[header];
			if (value === null || value === undefined) {
				return '';
			}
			const stringValue = String(value);
			return `"${stringValue.replace(/"/g, '""')}"`;
		}).join(',')
	);

	return [csvHeaders, ...csvRows].join('\n');
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// Get parameters
		const period = url.searchParams.get('period') || 'all';
		const startDateParam = url.searchParams.get('startDate');
		const endDateParam = url.searchParams.get('endDate');
		const format = url.searchParams.get('format') || 'json'; // 'json' or 'csv'
		const dataType = url.searchParams.get('type') || 'rides'; // 'rides', 'bookings', 'users', 'all'

		const dateRange = getDateRange(period, startDateParam || undefined, endDateParam || undefined);

		const exportData: any = {
			exportedAt: new Date().toISOString(),
			period,
			dateRange,
			data: {}
		};

		// Fetch rides data
		if (dataType === 'rides' || dataType === 'all') {
			const { data: rides, error: ridesError } = await adminClient
				.from('rides')
				.select('*')
				.gte('ride_date', dateRange.start)
				.lte('ride_date', dateRange.end);

			if (!ridesError && rides) {
				exportData.data.rides = rides;
			}
		}

		// Fetch bookings data
		if (dataType === 'bookings' || dataType === 'all') {
			const { data: bookings, error: bookingsError } = await adminClient
				.from('bookings')
				.select('*')
				.gte('created_at', dateRange.start)
				.lte('created_at', dateRange.end);

			if (!bookingsError && bookings) {
				exportData.data.bookings = bookings;
			}
		}

		// Fetch users data
		if (dataType === 'users' || dataType === 'all') {
			const { data: profiles, error: profilesError } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email, created_at, is_verified, average_rating')
				.gte('created_at', dateRange.start)
				.lte('created_at', dateRange.end);

			if (!profilesError && profiles) {
				exportData.data.users = profiles;
			}
		}

		// Format and return data
		if (format === 'csv') {
			let csvContent = '';

			if (exportData.data.rides?.length > 0) {
				csvContent += '# RIDES DATA\n';
				csvContent += convertToCSV(exportData.data.rides) + '\n\n';
			}

			if (exportData.data.bookings?.length > 0) {
				csvContent += '# BOOKINGS DATA\n';
				csvContent += convertToCSV(exportData.data.bookings) + '\n\n';
			}

			if (exportData.data.users?.length > 0) {
				csvContent += '# USERS DATA\n';
				csvContent += convertToCSV(exportData.data.users) + '\n';
			}

			const filename = `platform-data-${period}-${new Date().toISOString().split('T')[0]}.csv`;

			return new Response(csvContent, {
				status: 200,
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="${filename}"`
				}
			});
		} else {
			const filename = `platform-data-${period}-${new Date().toISOString().split('T')[0]}.json`;

			return new Response(JSON.stringify(exportData, null, 2), {
				status: 200,
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Content-Disposition': `attachment; filename="${filename}"`
				}
			});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
