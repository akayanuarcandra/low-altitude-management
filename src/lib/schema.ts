import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  decimal,
  foreignKey,
} from "drizzle-orm/pg-core";

export const tasks = pgTable("Task", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  // Patrol-specific fields
  patrolRadiusMeters: integer("patrol_radius_meters"),
  patrolDurationSeconds: integer("patrol_duration_seconds"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  droneId: integer("drone_id"),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const towers = pgTable("Tower", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  rangeMeters: integer("range_meters").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const drones = pgTable(
  "Drone",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 8 }),
    longitude: decimal("longitude", { precision: 11, scale: 8 }),
    towerId: integer("tower_id"),
    status: text("status").notNull().default("inventory"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    towerFk: foreignKey({
      columns: [table.towerId],
      foreignColumns: [towers.id],
    }).onDelete("set null"),
  }),
);

export const waypoints = pgTable("Waypoint", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stations = pgTable("Station", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const precomputedRoutes = pgTable("PrecomputedRoute", {
  id: serial("id").primaryKey(),
  droneId: integer("drone_id").notNull(),
  stopsHash: text("stops_hash"),
  stopsJson: text("stops_json"),
  startLat: text("start_lat"),
  startLon: text("start_lon"),
  routeJson: text("route_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// TaskItem table uses existing DB columns: item_id, delivery_latitude, delivery_longitude, sequence
export const taskItems = pgTable(
  "TaskItem",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull(),
    itemId: integer("item_id"),
    quantity: integer("quantity").notNull().default(1),
    deliveryLatitude: decimal("delivery_latitude", {
      precision: 10,
      scale: 8,
    }).notNull(),
    deliveryLongitude: decimal("delivery_longitude", {
      precision: 11,
      scale: 8,
    }).notNull(),
    sequence: integer("sequence").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    taskFk: foreignKey({
      columns: [table.taskId],
      foreignColumns: [tasks.id],
    }).onDelete("cascade"),
    itemFk: foreignKey({
      columns: [table.itemId],
      foreignColumns: [waypoints.id],
    }).onDelete("set null"),
  }),
);
