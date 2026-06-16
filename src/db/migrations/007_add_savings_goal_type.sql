-- Agregar nuevo valor al ENUM transaction_type
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'savings_goal';