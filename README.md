# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Authentication Setup

This project includes Supabase authentication with email/password and Google OAuth.

### Environment Variables

Create a `.env.local` file with your Supabase credentials:

```
VITE_PUBLIC_SUPABASE_URL=your_supabase_url
VITE_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
# Optional: defaults to sandbox API endpoint
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
```

### Supabase Configuration

1. **Email Authentication**: Enabled by default in Supabase.

2. **Google OAuth Setup**:
   - Go to **Authentication > Providers** in your Supabase dashboard
   - Enable the **Google** provider
   - Create OAuth credentials in Google Cloud Console:
     - Go to [Google Cloud Console](https://console.cloud.google.com/)
     - Create a new project or select existing one
     - Enable Google+ API
     - Go to Credentials > Create Credentials > OAuth 2.0 Client IDs
     - Set Application type to "Web application"
     - Add authorized redirect URIs: `https://your-project.supabase.co/auth/v1/callback`
     - Copy Client ID and Client Secret
   - In Supabase, paste the Client ID and Client Secret
   - Set redirect URL to: `http://localhost:5173/auth/callback` (for development)
   - Save changes

3. **User Status**:
   - New users signing up with email are set to "Unverified" status
   - Users signing in with Google are considered verified

### Routes

- `/auth/signup` - User registration
- `/auth/login` - User login
- `/profile` - User profile (requires authentication)

## Payments MVP (PayPal / Venmo)

This project now supports a payment-first booking flow for rides:

- Passenger chooses seats and payment method (`PayPal` or `Venmo`) on the ride page.
- PayPal order is created server-side and user is redirected for approval.
- On return, order is captured immediately.
- Booking is created only after capture succeeds.
- Funds are stored in platform escrow state (`payments.status = captured`) and released manually for MVP.

### Database setup

Run the SQL migration file below in Supabase SQL editor:

- `create_payments_table.sql`

### Payment status model

- `created`: order created, waiting for payer approval/capture
- `captured`: payment captured, funds held on platform
- `released`: manually released to driver (MVP: manual DB/admin action)
- `cancelled`: payer cancelled before capture
- `failed`: provider capture failed
- `captured_issue`: capture succeeded but booking creation failed (manual support required)

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv create --template minimal --types ts --add prettier eslint tailwindcss="plugins:typography,forms" --install npm afrorcq
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## 🔒 reCAPTCHA Configuration

### 1. **Get reCAPTCHA Keys**
- Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- Click "Create" or "+" button
- Choose **reCAPTCHA v2** > "I'm not a robot" Checkbox
- Fill in:
  - **Label**: Your app name
  - **reCAPTCHA type**: v2 "I'm not a robot" Checkbox
  - **Domains**: `localhost` (for development) and your production domain
- Click "Submit"
- Copy the **Site Key** and **Secret Key**

### 2. **Configure in Your App**
Replace `YOUR_RECAPTCHA_SITE_KEY` in the following files with your actual Site Key:
- `src/routes/auth/signup/+page.svelte`
- `src/routes/auth/login/+page.svelte`

### 3. **Environment Variables (Optional)**
For production, consider using environment variables:
```env
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
```

Then update the HTML to use the env var:
```html
<div class="g-recaptcha" data-sitekey="{import.meta.env.VITE_RECAPTCHA_SITE_KEY}" ...></div>
```

### 4. **Server-side Verification (Optional)**
For additional security, verify the reCAPTCHA token on your server. The token is available in `recaptchaToken` variable.

## 🔒 Security Features

- ✅ reCAPTCHA v2 verification on signup/login
- ✅ Token validation before form submission
- ✅ Error messages for missing verification
- ✅ Token expiration handling
