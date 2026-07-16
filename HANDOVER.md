# Project Handover Guide: VERDE Decision Support System

This document outlines the steps required to take ownership of the VERDE system, including the web application, database, and AI services.

## 1. Required Accounts

You will need to create accounts for the following services:

- **GitHub:** To manage the source code. One person from the group should be the owner.
- **Vercel:** To host the web application.
- **Supabase:** To manage the database and authentication.
- **Google AI Studio:** To get a Gemini API key.

## 2. Transferring Ownership

### 2.1. Source Code (GitHub)

1.  The designated owner should create a new **private** repository on GitHub.
2.  I will transfer the complete source code to you. You will then push it to your new private repository.
3.  Add your team members as collaborators in your repository settings.

### 2.2. Hosting (Vercel)

1.  The owner should sign up for Vercel using their GitHub account.
2.  Create a new project on Vercel and import the new GitHub repository you just created.
3.  Vercel will now automatically deploy the application.

## 3. Configuring Environment Variables

This is the most critical step. The application will not work without these settings. In your Vercel project dashboard, go to **Settings -> Environment Variables**. Add the following keys and use the values you obtain from the steps below.

### 3.1. Supabase Keys

1.  Create a new project in your Supabase account.
2.  In the Supabase dashboard, go to **Project Settings -> API**.
3.  You will find the `Project URL` and the `anon` `public` key.
4.  Create the following environment variables in Vercel:
    - `NEXT_PUBLIC_SUPABASE_URL`: Use the `Project URL`.
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Use the `anon` `public` key.

### 3.2. Gemini API Key

1.  Go to Google AI Studio.
2.  Click on "**Get API key**" and create a new API key in a new or existing Google Cloud project.
3.  Create the following environment variable in Vercel:
    - `GEMINI_API_KEY`: Paste the API key you just generated.

**IMPORTANT:** All keys should be set for **Production, Preview, and Development** environments in Vercel to ensure the application works correctly.

## 4. Final Steps

Once the environment variables are set, you must redeploy the application on Vercel for the changes to take effect. Go to the **Deployments** tab in Vercel, select the latest deployment, and choose "**Redeploy**".

After this, the system will be running entirely on your accounts and infrastructure.
