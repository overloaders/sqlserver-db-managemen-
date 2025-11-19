"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const connection_1 = require("../db/connection");
const mssql_1 = __importDefault(require("mssql"));
const router = (0, express_1.Router)();
// Register route
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const pool = await (0, connection_1.connectDB)();
        // Check if user already exists
        const checkUser = await pool.request()
            .input('username', mssql_1.default.VarChar, username)
            .query('SELECT id FROM Users WHERE username = @username');
        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        // Hash password
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Create user
        const result = await pool.request()
            .input('username', mssql_1.default.VarChar, username)
            .input('password', mssql_1.default.VarChar, hashedPassword)
            .query(`
        INSERT INTO Users (username, password, created_at) 
        VALUES (@username, @password, GETDATE());
        SELECT SCOPE_IDENTITY() as id;
      `);
        const userId = result.recordset[0].id;
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: userId, username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: { id: userId, username }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const pool = await (0, connection_1.connectDB)();
        // Find user
        const result = await pool.request()
            .input('username', mssql_1.default.VarChar, username)
            .query('SELECT id, username, password FROM Users WHERE username = @username');
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = result.recordset[0];
        // Verify password
        const isValidPassword = await bcrypt_1.default.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=authRoutes.js.map