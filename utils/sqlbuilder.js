// db.js
const mysql = require('mysql2/promise');

const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env

const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    connectionLimit: 60,
    timezone: '+00:00',  // treat DATETIME columns as UTC to match moment.utc() writes
    family: 4,           // force IPv4 — prevents localhost resolving to ::1 (IPv6) on Linux
});

function buildWhereClause(where = {}) {
    const keys = Object.keys(where);
    const conditions = keys.map(k => `${k} = ?`).join(' AND ');
    const values = keys.map(k => where[k]);
    return { clause: conditions, values };
}

const db = {
    insert: async (table, data) => {
        const keys          = Object.keys(data);
        const values        = Object.values(data);
        const placeholders  = keys.map(() => '?').join(', ');

        const [result] = await pool.execute(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
        return result;
    },

    bulkInsert: async (table, dataArray, chunkSize = 1000) => {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new Error('Data array must be a non-empty array');
        }

        const keys = Object.keys(dataArray[0]);
        const results = [];

        for (let i = 0; i < dataArray.length; i += chunkSize) {
            const chunk = dataArray.slice(i, i + chunkSize);

            const placeholders = chunk
                .map(() => `(${keys.map(() => '?').join(', ')})`)
                .join(', ');

            const values = chunk.reduce((acc, row) => {
                return acc.concat(keys.map(key => row[key]));
            }, []);

            const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;

            const [result] = await pool.execute(sql, values);
            results.push(result);
        }

        return results; // optionally merge affectedRows count, etc.
    },

    select: async (table, where = {}, columns = '*', offset = 0, limit = 10) => {
        const { clause, values } = buildWhereClause(where);
        const sql = clause ? 
        `SELECT ${columns} FROM ${table} WHERE ${clause} LIMIT ${limit} OFFSET ${offset}` : 
        `SELECT ${columns} FROM ${table} LIMIT ${limit} OFFSET ${offset}`;

        console.log("Log Full SQL : ", sql)
        console.log("Log SQL Params : ", values)
        
        const [rows] = await pool.execute(sql, values);
        return rows;
    },

    selectJoin: async (options) => {
        const {
            table,            // Main table
            joins = [],       // Array of join objects
            where = {},       // Where conditions
            columns = '*',    // Columns to select
            offset = 0,       // Offset for pagination
            limit = 10        // Limit for pagination
        } = options;
        console.log('Log Select Join Options : ', options)

        // Build JOIN clauses
        const joinClauses = joins.map(join => {
            const { type = 'INNER', table: joinTable, on } = join;
            const conditions = Object.entries(on)
                .map(([key, value]) => `${key} = ${value}`)
                .join(' AND ');
            return `${type} JOIN ${joinTable} ON ${conditions}`;
        }).join(' ');

        // Build WHERE clause
        const { clause: whereClause, values: whereValues } = buildWhereClause(where);

        // Construct full SQL query
        const sql = whereClause ?
            `SELECT ${columns} FROM ${table} ${joinClauses} WHERE ${whereClause} LIMIT ${limit} OFFSET ${offset}` :
            `SELECT ${columns} FROM ${table} ${joinClauses} LIMIT ${limit} OFFSET ${offset}`;

        const [rows] = await pool.execute(sql, whereValues);
        return rows;
    },

    update: async (table, data, where = {}) => {
        const dataKeys      = Object.keys(data);
        const dataValues    = Object.values(data);
        const setClause     = dataKeys.map(k => `${k} = ?`).join(', ');

        const { clause, values: whereValues } = buildWhereClause(where);
        const sql       = `UPDATE ${table} SET ${setClause} WHERE ${clause}`;
        const [result]  = await pool.execute(sql, [...dataValues, ...whereValues]);
        return result.affectedRows;
    },

    delete: async (table, where = {}) => {
        const { clause, values } = buildWhereClause(where);
        const sql       = `DELETE FROM ${table} WHERE ${clause}`;
        const [result]  = await pool.execute(sql, values);
        return result;
    },

    raw: async (sql, params = []) => {
        const [result] = await pool.execute(sql, params);
        return result;
    }
};

module.exports = db;