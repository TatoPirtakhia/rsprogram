ALTER TABLE users ADD username VARCHAR(254) NULL;
UPDATE users SET username=CASE WHEN email='demo@bizmonitor.ge' THEN 'demo' ELSE LOWER(email) END;
ALTER TABLE users MODIFY username VARCHAR(254) NOT NULL, ADD UNIQUE KEY unique_username(username);
