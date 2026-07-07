INSERT INTO serving_roles (code, name, sort_order) VALUES
    ('worship_leader', 'Worship Leader', 10),
    ('singer', 'Singer', 20),
    ('keyboard', 'Keyboard', 30),
    ('guitar', 'Gitar', 40),
    ('bass', 'Bass', 50),
    ('drums', 'Drum', 60),
    ('multimedia', 'Multimedia', 70),
    ('soundman', 'Soundman', 80),
    ('usher', 'Usher', 90)
ON CONFLICT (code) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order;
