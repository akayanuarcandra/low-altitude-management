import { pgTable, serial, text, boolean, integer, timestamp, decimal, foreignKey } from "drizzle-orm/pg-core";

export const tasks = pgTable("Task", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Towers Table
 * Represents communication towers placed on the map.
 * Each tower has a location (latitude, longitude) and a broadcast range in meters.
 */
export const towers = pgTable("Tower", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(), // e.g., 40.7128
    longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(), // e.g., -74.0060
    rangeMeters: integer("range_meters").notNull(), // broadcast range in meters
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Drones Table
 * Represents drones that can move around the map.
 * Each drone is tied to a tower and must stay within its range.
 */
export const drones = pgTable("Drone", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
    longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
    towerId: integer("tower_id").notNull(),
    status: text("status").notNull().default("active"), // "active", "inactive", "charging"
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
    // Foreign key constraint: a drone must reference an existing tower
    towerFk: foreignKey({
        columns: [table.towerId],
        foreignColumns: [towers.id],
    }),
}));