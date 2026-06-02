import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";

// Initialize SQLite database
const dbDir = path.join(process.cwd(), "db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}
const db = new Database(path.join(dbDir, "qr_database.sqlite"));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS qrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'Đang chạy',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (qr_id) REFERENCES qrs (id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // API Routes
  
  // Get all QRs with stats
  app.get("/api/qr", (req, res) => {
    try {
      const { start, end } = req.query;
      let dateFilter = "";
      const params: any[] = [];
      
      if (start && end) {
        dateFilter = "AND s.timestamp >= ? AND s.timestamp <= ? || ' 23:59:59'";
        params.push(start, end);
      }

      const qrs = db.prepare(`
        SELECT q.*, COUNT(s.id) as scans 
        FROM qrs q 
        LEFT JOIN scans s ON q.id = s.qr_id ${dateFilter}
        GROUP BY q.id 
        ORDER BY q.created_at DESC
      `).all(...params);
      res.json(qrs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Get stats
  app.get("/api/stats", (req, res) => {
    try {
      const { start, end } = req.query;
      
      let dateFilter = "";
      const params: any[] = [];
      
      if (start && end) {
        dateFilter = "WHERE timestamp >= ? AND timestamp <= ? || ' 23:59:59'";
        params.push(start, end);
      }
      
      const runningQRsParams = [];
      let runningFilter = "";
      if (start && end) {
         // for Qrs we just return current running count, it doesn't strictly depend on scan dates, but let's just return total running.
      }
      
      const runningQRs = (db.prepare("SELECT COUNT(*) as count FROM qrs WHERE status = 'Đang chạy'").get() as any).count;
      
      const totalScansQuery = `SELECT COUNT(*) as count FROM scans ${dateFilter}`;
      const totalScans = (db.prepare(totalScansQuery).get(...params) as any).count;
      
      // scans today
      const scansToday = (db.prepare("SELECT COUNT(*) as count FROM scans WHERE date(timestamp) = date('now')").get() as any).count;
      
      // scans this week
      const scansWeek = (db.prepare("SELECT COUNT(*) as count FROM scans WHERE timestamp >= date('now', '-7 days')").get() as any).count;

      // trend for chart
      const trendQuery = `
        SELECT date(timestamp) as date, COUNT(*) as count 
        FROM scans 
        ${dateFilter ? dateFilter : "WHERE timestamp >= date('now', '-7 days')"}
        GROUP BY date(timestamp)
        ORDER BY date ASC
      `;
      const trend = db.prepare(trendQuery).all(...params);

      res.json({
        runningQRs,
        totalScans,
        scansToday,
        scansWeek,
        trend
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Create QR
  app.post("/api/qr", (req, res) => {
    try {
      const { name, url } = req.body;
      if (!name || !url) {
        return res.status(400).json({ error: "Thieu name hoac url" });
      }
      
      const insert = db.prepare('INSERT INTO qrs (name, url) VALUES (?, ?)');
      const result = insert.run(name, url);
      
      const qr = db.prepare(`
        SELECT q.*, 0 as scans 
        FROM qrs q 
        WHERE id = ?
      `).get(result.lastInsertRowid);
      
      res.status(201).json(qr);
    } catch (err) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Update QR
  app.put("/api/qr/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, url, status } = req.body;
      
      const update = db.prepare(`
        UPDATE qrs 
        SET name = COALESCE(?, name), 
            url = COALESCE(?, url), 
            status = COALESCE(?, status)
        WHERE id = ?
      `);
      update.run(name, url, status, id);
      
      const qr = db.prepare(`
        SELECT q.*, COUNT(s.id) as scans 
        FROM qrs q 
        LEFT JOIN scans s ON q.id = s.qr_id 
        WHERE q.id = ? 
        GROUP BY q.id
      `).get(id);
      
      res.json(qr);
    } catch (err) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Delete QR
  app.delete("/api/qr/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM qrs WHERE id = ?').run(id);
      res.json({ message: "Deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Redirect endpoint for QR code tracking
  app.get("/go/:id", (req, res) => {
    try {
      const { id } = req.params;
      const qr = db.prepare('SELECT url, status FROM qrs WHERE id = ?').get(id) as any;
      
      if (!qr) {
        return res.status(404).send("QR Not Found");
      }
      
      if (qr.status === 'Đã dừng') {
        return res.status(403).send("Mã QR này đang bị tạm dừng.");
      }
      
      // Log the scan
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';
      
      db.prepare('INSERT INTO scans (qr_id, ip_address, user_agent) VALUES (?, ?, ?)').run(id, String(ip), String(userAgent));
      
      // Redirect
      const destUrl = qr.url.startsWith('http') ? qr.url : `https://${qr.url}`;
      res.redirect(302, destUrl);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
