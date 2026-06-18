INSERT INTO pelayanan_types (code, name) VALUES
    ('ibadah_umum', 'Ibadah Umum'),
    ('pemuda', 'Pemuda')
ON CONFLICT (code) DO UPDATE SET name = excluded.name;
