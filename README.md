# Smart Blood Donor Management System

A production-style healthcare dashboard that connects donors, emergency blood requests, search tools, and analytics through live Supabase data.

## Features
- Google authentication and protected pages
- Donor registration, editing, deletion, and availability toggle
- Emergency request creation, updates, and deletion
- Smart donor search with location-based sorting
- Blood compatibility checker
- Analytics dashboard and donor card generation
- Dark mode and mobile responsive design

## Supabase setup
1. Replace the placeholder values in [supabase.js](supabase.js) with your actual Supabase project URL and anon key.
2. Ensure the database includes `profiles`, `donors`, and `blood_requests` tables.
3. Configure Row Level Security policies for the required tables.

## Run locally
1. Open [index.html](index.html) directly in a browser, or run a local static server.
2. Sign in with Google to access protected features.

## Notes
- This project is designed for a Final Year BCA demonstration and uses live Supabase-backed records.
- The app requires your own Supabase credentials to function fully.
