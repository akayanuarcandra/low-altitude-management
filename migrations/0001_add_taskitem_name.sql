-- Add name column to TaskItem so delivery items can carry a display name
ALTER TABLE "TaskItem" ADD COLUMN IF NOT EXISTS name text;
