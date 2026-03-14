# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Authentication Setup

This project includes Supabase authentication with email/password and Google OAuth.

### Environment Variables

Create a `.env.local` file with your Supabase credentials:

```
VITE_PUBLIC_SUPABASE_URL=your_supabase_url
VITE_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
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
