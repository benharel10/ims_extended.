# How to Share Your System with Workers

You have two main options to make your system accessible to your workers. Choose the one that fits your needs best.

## Option 1: Local Network (Zero Cost, Instant)
**Best if:** Your workers are in the same building/office and use the same Wi-Fi network.

1.  **Stop the current server:**
    *   Click in your terminal (where `npm run dev` is running).
    *   Press `Ctrl + C` to stop it.

2.  **Run the server for the network:**
    *   Run this command:
        ```bash
        npm run dev -- -H 0.0.0.0
        ```

3.  **Find your Computer's IP Address:**
    *   Open a new terminal (Powershell or Command Prompt).
    *   Type `ipconfig` and press Enter.
    *   Look for **IPv4 Address**. It will look like `192.168.1.5` or similar.

4.  **Connect Workers:**
    *   Tell your workers to open their browser (Chrome/Edge).
    *   Type your IP address followed by `:3000`.
    *   Example: `http://192.168.1.5:3000`

**Note:** Your computer must stay **ON** and the terminal running for them to access it.

---

## Option 2: Cloud Deployment (Professional, Accessible Anywhere)
**Best if:** Workers are remote, or you want a reliable system that runs 24/7 without your computer.

We recommend using **Vercel** (for the app) and **Neon** (for the database). Both have free tiers.

### Step 1: Set up the Database (Neon)
1.  Go to [Neon.tech](https://neon.tech) and sign up.
2.  Create a newly **Project**.
3.  Copy the **Connection String** (it looks like `postgres://...`).
4.  Update your local `.env` file with this new URL to test it, or save it for the next step.

### Step 2: Deploy the App (Vercel)
1.  Push your code to **GitHub** (if you haven't already).
2.  Go to [Vercel.com](https://vercel.com) and sign up with GitHub.
3.  Click **"Add New..."** -> **Project**.
4.  Import your GitHub repository.
5.  In the **Environment Variables** section:
    *   Add `DATABASE_URL` and paste your Neon connection string.
    *   Add `JWT_SECRET` and paste a long random secret key.
6.  Click **Deploy**.

Vercel will give you a domain (e.g., `ksw-inventory.vercel.app`) that anyone can access from anywhere.
