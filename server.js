// server.js
const express = require('express');
const mysql = require('mysql2/promise');
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

// Crear el pool de conexiones
const pool = mysql.createPool(process.env.DATABASE_URL);

// Verificar conexión
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Conectado exitosamente a MySQL Externo");
        connection.release();
    } catch (err) {
        console.error("❌ Error conectando a MySQL:", err.message);
    }
})();

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
app.get('/api/rifa', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM participantes");
        const data = {};
        rows.forEach(row => { 
            data[row.id.toString().padStart(2, '0')] = row; 
        });
        res.json(data);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Guardar o actualizar un número
app.post('/api/rifa', async (req, res) => {
    const isAdmin = req.session.isAdmin;
    const { id, nombre, telefono, status, cobrador, validado } = req.body;
    try {
        const [rows] = await pool.query("SELECT * FROM participantes WHERE id = ?", [id]);
        // REGLA: Si NO es admin, solo puede registrar si la casilla está vacía
        // REGLA: Si ES admin, puede hacer todo (Editar, Borrar, Validar)        
        if (!isAdmin && rows.length) {
            return res.status(403).json({ error: "Esta casilla ya no está disponible" });
        } else if (isAdmin && status === 'libre') {
            await pool.query("DELETE FROM participantes WHERE id = ?",[id])
            res.json({ ok: true })
        } else {
            const sql = `
                INSERT INTO participantes (id, nombre, telefono, status, cobrador, validado)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE nombre=?, telefono=?, status=?, cobrador=?, validado=?`;
            
            await pool.query(sql, 
                [id, nombre, telefono, status, cobrador, isAdmin && validado ? 1 : 0
                , nombre, telefono, status, cobrador, isAdmin && validado ? 1 : 0]);
            res.json({ ok: true })
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint para descargar el reporte con seguridad
app.get('/api/export', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send("Acceso denegado");
    }
    try {
        const [rows] = await pool.query("SELECT * FROM participantes ORDER BY id ASC");
        let csv = "\uFEFFNumero,Nombre,Telefono,Estado,Cobrador,Validado\n";
        rows.forEach(r => {
            csv += `${r.id},"${r.nombre}","${r.telefono}",${r.status},${r.cobrador},${r.validado ? 'Si' : 'No'}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/export-json', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "No autorizado" });
    try {
        const [rows] = await pool.query("SELECT * FROM participantes");
        res.json(rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Ruta para importar datos (SOLO ADMIN)
app.post('/api/import', async (req, res) => {
    if (!req.session.isAdmin) return res.status(401).json({ error: "No autorizado" });

    const datos = req.body; // Se espera un array de objetos [{id, nombre, status...}]

    if (!Array.isArray(datos)) return res.status(400).json({ error: "Formato inválido" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const p of datos) {
            await connection.query(`INSERT INTO participantes (id, nombre, telefono, status, cobrador, validado)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE nombre=?, telefono=?, status=?, cobrador=?, validado=?`, 
                [p.id, p.nombre, p.telefono, p.status, p.cobrador, p.validado
                    , p.nombre, p.telefono, p.status, p.cobrador, p.validado]
            );
        };
        await connection.commit();
        res.json({ success: true, count: datos.length });
    } catch (error) {
        await connection.rollback();
        console.error("❌ Error en la transacción, se hizo rollback:", error);
        res.status(500).json({ error: "Error durante la importación masiva" });
    } finally {
        // ¡Súper importante! Devolvemos la conexión al pool
        connection.release();
    }
});

app.listen(port, () => console.log("Servidor listo en puerto " . port));