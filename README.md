# Database Manager

A web-based database management tool built with Express.js, TypeScript, mssql, and React with AdminLTE UI.

## Features

- **Backend**: Express.js with TypeScript, direct mssql integration
- **Frontend**: React with AdminLTE UI framework
- **Authentication**: JWT-based authentication
- **Database Operations**: 
  - Browse database tables
  - View table data with pagination
  - Execute custom SQL queries
  - View table structure and metadata
- **Security**: SQL injection prevention, JWT authentication

### Extended Features

- **Stored Procedures (Level Database)**: Lihat, buat, edit, hapus prosedur tersimpan per database
- **Triggers (Level Tabel)**: Lihat, buat, edit, hapus trigger per tabel
- **Row View/Edit Modal**: Klik baris data untuk membuka modal view dengan tombol Edit ke modal edit
- **Backup/Restore Database**: Backup database ke file `.bak` dan restore dari file `.bak`

## Prerequisites

- Node.js (v18 or higher)
- SQL Server instance
- npm or yarn

## Setup Instructions

### 1. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Update the `.env` file with your SQL Server credentials:
```env
DB_SERVER=localhost
DB_DATABASE=master
DB_USERNAME=sa
DB_PASSWORD=your_password
DB_PORT=1433
JWT_SECRET=your_jwt_secret_key_here
```

Create the Users table in your SQL Server:
```sql
-- Run the SQL script in backend/sql/setup_users_table.sql
```

Start the backend server:
```bash
# Default port adalah 3002
npm run dev

# Opsi: jalankan di port 3001
PORT=3001 npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Update the `.env` file if needed:
```env
VITE_API_URL=http://localhost:3002/api
# Jika backend berjalan di 3001, gunakan:
# VITE_API_URL=http://localhost:3001/api
```

Start the frontend development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Database Management
- `GET /api/db/tables` - Get all database tables
- `GET /api/db/data/:tableName` - Get table data with pagination
- `POST /api/db/query` - Execute custom SQL query
- `GET /api/db/structure/:tableName` - Get table structure

### Stored Procedures (Database Level)
- `GET /api/db/procedures?database=<db>&schema=<schema>&search=<name>` - List prosedur
- `GET /api/db/procedures/:procedureName?database=<db>&schema=<schema>` - Ambil definisi prosedur
- `POST /api/db/procedures` - Buat prosedur
  - Body: `{ database, schema?: 'dbo', procedureName, definition }`
- `PUT /api/db/procedures/:procedureName` - Update prosedur
  - Body: `{ database, schema?: 'dbo', definition }`
- `DELETE /api/db/procedures/:procedureName` - Hapus prosedur
  - Body: `{ database, schema?: 'dbo' }`

Catatan:
- Server menormalkan header definisi. Anda boleh menempel body saja (isi di dalam `BEGIN ... END`). Server akan membungkus menjadi `CREATE/ALTER PROCEDURE [schema].[name] AS BEGIN ... END`.
- Token `GO` diabaikan.

### Triggers (Table Level)
- `GET /api/db/tables/:tableName/triggers?database=<db>` - List trigger suatu tabel
- `POST /api/db/tables/:tableName/triggers` - Buat trigger
  - Body: `{ database, triggerName, timing, event, definition }`
- `PUT /api/db/tables/:tableName/triggers/:triggerName` - Update trigger
  - Body: `{ database, timing, event, definition }`
- `DELETE /api/db/tables/:tableName/triggers/:triggerName` - Hapus trigger
  - Body: `{ database }`

### Backup/Restore
- `POST /api/db/backup` - Backup database ke file `.bak`
  - Body: `{ database, backupPath }`
- `POST /api/db/restore` - Restore database dari file `.bak`
  - Body: `{ database, backupPath, withReplace?: true }`

Catatan:
- Pastikan `backupPath` dapat diakses oleh service SQL Server (izin baca/tulis). Contoh: `C:\\temp\\db-YYYYMMDDHHmmss.bak`.

## Usage

1. **Login**: Navigate to `http://localhost:5173/login` and login with your credentials
2. **Browse Tables**: Use the sidebar to view available database tables
3. **View Data**: Click on any table name to view its data with pagination
4. **SQL Runner**: Use the SQL Runner to execute custom queries
5. **Logout**: Click on your username in the header and select Logout

### Manage Procedures
- Buka menu Database Management → klik database → tombol `Manage Procedures` di halaman tabel atau gunakan modal yang tersedia.
- Klik `Refresh` untuk memuat ulang daftar.
- `View`: menampilkan definisi lengkap.
- `Edit`: editor menampilkan hanya body (isi di dalam `BEGIN ... END`). Simpan akan menormalkan menjadi `ALTER PROCEDURE` sesuai nama/schema.
- `New Procedure`: isi nama dan body; simpan akan membuat `CREATE PROCEDURE`.

### Manage Triggers
- Buka halaman tabel dan pilih `Manage Triggers`.
- Buat/edit/hapus trigger per tabel.

### Backup/Restore
- Di halaman Database Management, setiap baris database memiliki tombol:
  - `Backup` (ikon download): isi path `.bak`, jalankan.
  - `Restore` (ikon upload): pilih path `.bak` sumber, jalankan (menggunakan `WITH REPLACE` dan `RECOVERY`).

### Row View/Edit Modal
- Di viewer data tabel, klik sebuah baris untuk membuka modal view.
- Tombol `Edit` akan membuka modal edit untuk baris tersebut.

## Security Features

- JWT-based authentication
- SQL injection prevention in custom queries
- Table name validation
- Dangerous SQL keywords filtering
- CORS protection
- Input validation and sanitization

### Operational Notes
- Pastikan `VITE_API_URL` sesuai port backend (`3002` default, atau `3001` jika diset).
- Operasi restore mengubah database ke `SINGLE_USER` sementara, lalu kembali `MULTI_USER` setelah selesai.

## Development

### Backend Development
```bash
cd backend
npm run dev  # Development server with hot reload
npm run build  # Build TypeScript
npm start  # Start production server
```

### Frontend Development
```bash
cd frontend
npm run dev  # Development server
npm run build  # Build for production
```

## Project Structure

```
sqlmanager/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   └── connection.ts      # Database connection
│   │   ├── middleware/
│   │   │   └── auth.ts            # JWT authentication
│   │   ├── routes/
│   │   │   ├── authRoutes.ts      # Authentication routes
│   │   │   └── dbRoutes.ts        # Database routes
│   │   └── index.ts               # Main server file
│   ├── sql/
│   │   └── setup_users_table.sql  # Database setup script
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.tsx          # Login page
│   │   │   ├── Layout.tsx         # Main layout
│   │   │   ├── Header.tsx         # Top navigation
│   │   │   ├── Sidebar.tsx        # Side navigation
│   │   │   ├── Dashboard.tsx      # Dashboard page
│   │   │   ├── TableViewer.tsx    # Table data viewer
│   │   │   └── SQLRunner.tsx      # SQL query runner
│   │   ├── services/
│   │   │   ├── api.ts             # Axios configuration
│   │   │   ├── authService.ts     # Authentication service
│   │   │   └── dbService.ts       # Database service
│   │   ├── stores/
│   │   │   └── authStore.ts       # Zustand auth store
│   │   └── App.tsx                # Main app component
│   └── package.json
└── README.md
```

## License

MIT License
