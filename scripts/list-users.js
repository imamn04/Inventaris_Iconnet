const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.query('SELECT username, password FROM users', (err, res) => {
    if (err) {
        console.error('Error fetching users', err.stack);
    } else {
        console.log('Registered Users:');
        res.rows.forEach(row => {
            console.log(`Username: ${row.username}, Password: ${row.password}`);
        });
    }
    pool.end();
});
