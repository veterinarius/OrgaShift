# OrgaShift

Schichtplanung für medizinische Teams.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Backend:** Supabase (Auth, Database, Realtime)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in your Supabase project URL and anon key

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/          # Next.js App Router pages and layouts
├── components/   # Reusable UI components
├── lib/          # Utilities (Supabase client, helpers)
└── types/        # TypeScript type definitions
_legacy/          # Original HTML/JS codebase (reference only)
```
