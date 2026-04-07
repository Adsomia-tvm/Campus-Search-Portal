# 🎓 Campus Search Portal

A full-stack education consultancy portal built with **React + Node.js + PostgreSQL**.

- **Public site** — Search colleges, filter by city/stream/fee, compare up to 3, submit enquiries
- **Admin CRM** — Dashboard, enquiry pipeline, student profiles, commission tracking, reports

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, React Query, Zustand, React Hook Form |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT + bcryptjs |
| Charts | Recharts |

---

## Prerequisites

- **Node.js** v18+ — https://nodejs.org
- **PostgreSQL** v14+ — https://postgresql.org (or use Supabase / Railway for free hosted Postgres)
- **Git** — https://git-scm.com

---

## Setup — Step by Step

### 1. Clone / open the project

Open Terminal in the `CampusSearch Portal` folder (the one containing `server/` and `client/`).

---

### 2. Set up the Backend

```bash
cd server
npm install
```

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Open `server/.env` and set:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/campussearch"
JWT_SECRET="any-long-random-string-here"
JWT_EXPIRES_IN="7d"
PORT=4000
CLIENT_URL="http://localhost:5173"

# Email notifications (use Gmail App Password or any SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
NOTIFY_EMAIL=md@adsomia.com

# Path to the fees Excel file (used during seed)
FEES_EXCEL_PATH=../../CampusSearch_Fees_2026-27.xlsx
```

#### Create the database

In PostgreSQL, create a new database called `campussearch`:

```sql
CREATE DATABASE campussearch;
```

Or with psql:

```bash
psql -U postgres -c "CREATE DATABASE campussearch;"
```

#### Push schema & seed data

```bash
# Push the Prisma schema to create all tables
npx prisma db push

# Seed the database — imports all 1,141 college fee rows from Excel
# and creates the default admin user
node prisma/seed.js
```

The seed script will:
- Import all colleges and courses from `CampusSearch_Fees_2026-27.xlsx`
- Create admin user: **md@adsomia.com** / **CampusSearch@2026**

#### Start the backend server

```bash
npm run dev
```

Server runs on **http://localhost:4000**

---

### 3. Set up the Frontend

Open a **new terminal tab** and:

```bash
cd client
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

---

## Default Admin Login

| Field | Value |
|-------|-------|
| URL | http://localhost:5173/admin/login |
| Email | md@adsomia.com |
| Password | CampusSearch@2026 |

> ⚠️ Change the password after first login in a production deployment.

---

## Project Structure

```
CampusSearch Portal/
├── server/
│   ├── prisma/
│   │   ├── schema.prisma       # Database models
│   │   └── seed.js             # Excel import + admin user creation
│   ├── src/
│   │   ├── index.js            # Express app entry point
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT auth middleware
│   │   └── routes/
│   │       ├── public/         # colleges, enquiries, categories
│   │       └── admin/          # dashboard, students, enquiries,
│   │                           # colleges, commissions, reports,
│   │                           # users, import
│   ├── .env.example
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── api/index.js        # All API helper functions
│   │   ├── context/
│   │   │   ├── auth.js         # Zustand auth store (JWT)
│   │   │   └── compare.js      # Zustand compare store (max 3)
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── CollegeCard.jsx
│   │   │   ├── FeeTable.jsx
│   │   │   └── AdminLayout.jsx
│   │   └── pages/
│   │       ├── Home.jsx
│   │       ├── Search.jsx
│   │       ├── CollegeDetail.jsx
│   │       ├── Compare.jsx
│   │       ├── Enquiry.jsx
│   │       ├── Thanks.jsx
│   │       └── admin/
│   │           ├── Login.jsx
│   │           ├── Dashboard.jsx
│   │           ├── Enquiries.jsx
│   │           ├── Students.jsx
│   │           ├── Commissions.jsx
│   │           └── Reports.jsx
│   ├── tailwind.config.js
│   ├── vite.config.js
│   ├── postcss.config.js
│   └── package.json
│
└── CampusSearch_Fees_2026-27.xlsx   # Source fee data (1,141 rows)
```

---

## Key Features

### Public Portal
- **Home** — Hero search, category cards, Top 10 cheapest colleges
- **Search** — Filter by city, stream, degree level, max budget; pagination
- **College Detail** — Full profile, fee table by year, contact info
- **Compare** — Side-by-side fee comparison for up to 3 colleges
- **Enquiry Form** — Student lead capture → email notification to admin

### Admin CRM
- **Dashboard** — Live stats (new today, enrolled, commissions pending), recent enquiries, follow-up reminders
- **Enquiries** — Kanban-style status tracking (New → Contacted → Visited → Applied → Enrolled → Dropped)
- **Students** — Full student database with add/edit
- **Commissions** — Track expected vs received, mark as received (auto-records payment date)
- **Reports** — Monthly trends, by-stream breakdown, by-city breakdown (charts + tables)

---

## Production Deployment

For production, build the frontend:

```bash
cd client
npm run build
```

Then serve `client/dist` via the Express server or a CDN (Netlify, Vercel).

Set `NODE_ENV=production` in `server/.env` and use a process manager like **PM2**:

```bash
npm install -g pm2
pm2 start server/src/index.js --name campussearch
pm2 save
```

---

## Support

Contact: md@adsomia.com
