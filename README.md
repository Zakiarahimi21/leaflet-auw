# BALI - ARCADE | Indoor Mall Map (leaflet-auw)

AUW internship project mapping spaces in Bangladesh. An interactive indoor mall floor map built with **Leaflet.js**, **Node.js (Express)**, and **PostgreSQL**.

---

##  Quick Setup Guide 

Follow these steps to run the project on your local computer.

### 1. Prerequisites
Make sure you have installed:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [PostgreSQL](https://www.postgresql.org/download/) & pgAdmin

---

### 2. Install Project Dependencies
In your terminal (inside the project root folder), run:
```bash
npm install
```

---

### 3. Setup the Database (Restore `bali_arcade.sql`)

You can restore the database using either the **Terminal** or **pgAdmin**:

#### Option A: Via Command Line / Terminal (Fastest)
```bash
# 1. Create the database
psql -U postgres -c "CREATE DATABASE bali_arcade;"

# 2. Restore all tables, store names, and normalized geometries
psql -U postgres -d bali_arcade -f database/bali_arcade.sql
```
*(Enter your PostgreSQL password when prompted).*

#### Option B: Via pgAdmin
1. Open **pgAdmin**.
2. Right-click **Databases** → **Create** → **Database...** → Name it: `bali_arcade` → Click **Save**.
3. Click on `bali_arcade` → open **Tools** → **Query Tool**.
4. Open the file `database/bali_arcade.sql` (or drag & drop it into the Query Tool).
5. Press **`F5`** (or click the **Play ▶** button) to run the script.

---


### 4. Start the Server

In your terminal, start the Node.js backend:
```bash
node server-pg.js
```

You should see:
```text
✅ Connected to PostgreSQL
🚀 Bali Arcade API Server (PostgreSQL) is RUNNING!
📡 URL: http://localhost:3000
```
*(Keep this terminal open while using the application).*

---

### 5. View the Map

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ✨ Features
- **Live Database Sync:** Click any store on the map and click **"Edit store"** — changes to the store name and category save directly to your PostgreSQL database in real time.
- **Normalized Geometry:** Store polygons are straight and snapped to clean grid lines.
- **Interactive Floor Plan:** Smooth pan to stores on click without aggressive zoom jumps.
- **Search & Filters:** Search for shops by name or filter by category (Clothing, Tech, Facilities, etc.).

---

## 💾 How to Export / Update the Database Backup

If you make new changes in PostgreSQL and want to share the updated data with the team:

```bash
pg_dump -U postgres -d bali_arcade -F p -f database/bali_arcade.sql
```
Then commit and push `database/bali_arcade.sql` to Git:
```bash
git add database/bali_arcade.sql
git commit -m "Update database backup with latest stores"
git push
```
