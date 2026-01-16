// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000 
const ADMIN_PASS = process.env.ADMIN_PASS || "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || "clave-secreta-rifa";

app.use(express.json());
app.use(express.static('.'));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 8 * 60 * 60 * 1000,
        httpOnly: true,
    }
}));

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'rifa.db');

// Configuración de la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error al abrir DB", err);
    } else {
        console.log("Conectado exitosamente a SQLite en:", dbPath);
        db.run(`CREATE TABLE IF NOT EXISTS participantes (
            id TEXT PRIMARY KEY,
            nombre TEXT,
            telefono TEXT,
            status TEXT,
            cobrador TEXT, 
            validado INTEGER DEFAULT 0
        )`);
    }
});

// --- RUTAS DE SEGURIDAD ---
app.post('/api/login', (req, res) => {
    if (req.body.pass === ADMIN_PASS) {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Password incorrecto" });
    }
});

app.get('/api/check-auth', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// --- GESTIÓN DE RIFA ---
// Obtener todos los números
app.get('/api/rifa', (req, res) => {
    db.all("SELECT * FROM participantes", [], (err, rows) => {
        const data = {};
        rows.forEach(row => { data[row.id] = row; });
        res.json(data);
    });
});

// Guardar o actualizar un número
app.post('/api/rifa', (req, res) => {
    const isAdmin = req.session.isAdmin;
    const { id, nombre, telefono, status, cobrador, validado } = req.body;
    db.get("SELECT * FROM participantes WHERE id = ?", [id], (err, row) => {
        // REGLA: Si NO es admin, solo puede registrar si la casilla está vacía
        // REGLA: Si ES admin, puede hacer todo (Editar, Borrar, Validar)
        if (!isAdmin && row) {
            return res.status(403).json({ error: "Esta casilla ya no está disponible" });
        } else if (isAdmin && status === 'libre') {
            db.run("DELETE FROM participantes WHERE id = ?", [id], () => res.json({ ok: true }));
        } else {
            db.run(`INSERT INTO participantes (id, nombre, telefono, status, cobrador, validado) 
                VALUES (?, ?, ?, ?, ?, ?) 
                ON CONFLICT(id) DO UPDATE SET 
                nombre=excluded.nombre, telefono=excluded.telefono, 
                status=excluded.status, cobrador=excluded.cobrador, validado=excluded.validado`, 
            [id, nombre, telefono, status, cobrador, isAdmin && validado ? 1 : 0], () => res.json({ ok: true }));
        }
    });
});

// Endpoint para descargar el reporte con seguridad
app.get('/api/export', (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send("Acceso denegado");
    }
    db.all("SELECT * FROM participantes ORDER BY id ASC", [], (err, rows) => {
        let csv = "\uFEFFNumero,Nombre,Telefono,Estado,Cobrador,Validado\n";
        rows.forEach(r => {
            csv += `${r.id},"${r.nombre}","${r.telefono}",${r.status},${r.cobrador},${r.validado ? 'Si' : 'No'}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte.csv');
        res.send(csv);
    });
});

app.get('/api/export-json', (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "No autorizado" });

    db.all("SELECT * FROM participantes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Error al leer la base de datos" });

        res.json(rows);
    });
});

// Ruta para importar datos (SOLO ADMIN)
app.post('/api/import', (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "No autorizado" });

    const datos = req.body; // Se espera un array de objetos [{id, nombre, status...}]

    if (!Array.isArray(datos)) return res.status(400).json({ error: "Formato inválido" });

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        const stmt = db.prepare(`
            INSERT INTO participantes (id, nombre, telefono, status, cobrador, validado) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
            nombre=excluded.nombre, telefono=excluded.telefono, 
            status=excluded.status, cobrador=excluded.cobrador, validado=excluded.validado
        `);

        datos.forEach(p => {
            stmt.run(p.id, p.nombre, p.telefono, p.status, p.cobrador, p.validado);
        });

        stmt.finalize((err) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: "Error al importar" });
            }
            db.run("COMMIT");
            res.json({ success: true, count: datos.length });
        });
    });
});

app.listen(port, () => console.log("Servidor listo en puerto " . port));