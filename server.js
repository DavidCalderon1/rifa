// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('.')); // Sirve el index.html

// Configuración de la base de datos
const db = new sqlite3.Database('./rifa.db', (err) => {
    if (err) console.error("Error al abrir DB", err);
    db.run(`CREATE TABLE IF NOT EXISTS participantes (
        id TEXT PRIMARY KEY,
        nombre TEXT,
        telefono TEXT,
        status TEXT,
        cobrador TEXT
    )`);
});

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
    const { id, nombre, telefono, status, cobrador } = req.body;
    if (status === 'libre') {
        db.run("DELETE FROM participantes WHERE id = ?", [id], () => res.json({ok: true}));
    } else {
        db.run(`INSERT INTO participantes (id, nombre, telefono, status, cobrador) 
                VALUES (?, ?, ?, ?, ?) 
                ON CONFLICT(id) DO UPDATE SET 
                nombre=excluded.nombre, telefono=excluded.telefono, 
                status=excluded.status, cobrador=excluded.cobrador`, 
        [id, nombre, telefono, status, cobrador], () => res.json({ok: true}));
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Rifa corriendo en http://localhost:${PORT}`);
    console.log(`Para usar en otros dispositivos, usa tu IP local (ej. http://192.168.1.50:${PORT})`);
});