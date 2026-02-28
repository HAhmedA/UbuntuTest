-- Insert sample users for testing
-- Password for admin: "admin"
-- Password for student: "student"

-- First ensure the role column exists (moved from 005_add_role.sql)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role varchar(50) DEFAULT 'student';

-- Insert admin user with admin role
INSERT INTO public.users (email, name, password_hash, role) VALUES
('admin@example.com', 'Admin User', '$2b$10$N6oXGrgZone4.NibAZb2W.tJxEt.t7L/HdS0GSDQNazHuzBnsDBhO', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- Insert student user with student role
INSERT INTO public.users (email, name, password_hash, role) VALUES
('student@example.com', 'Student User', '$2b$10$SiaZsiznc1J23J2uPVlE7ODUmXGfMYhhX228RwldzdAhN3Hs8HCnS', 'student')
ON CONFLICT (email) DO NOTHING;
