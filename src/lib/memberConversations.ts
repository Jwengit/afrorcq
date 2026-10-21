import { supabase } from '$lib/supabaseClient';

export async function archiveResolvedMemberConversations(): Promise<{ success: boolean; error?: string }> {
	const {
		data: { session },
		error: sessionError
	} = await supabase.auth.getSession();

	if (sessionError) {
		return { success: false, error: sessionError.message };
	}
	if (!session?.access_token) {
		return { success: false, error: 'Session expired. Please sign in again.' };
	}

	try {
		const response = await fetch('/api/member-conversations/archive', {
			method: 'POST',
			headers: { Authorization: `Bearer ${session.access_token}` }
		});
		const payload = await response.json();
		if (!response.ok) {
			return { success: false, error: payload?.error || 'Unable to archive resolved conversations.' };
		}
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unable to archive resolved conversations.'
		};
	}
}
