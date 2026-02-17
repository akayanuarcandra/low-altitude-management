# Altitude Management - Class Diagram

```mermaid
classDiagram
    class Tower {
        +number id
        +string name
        +number latitude
        +number longitude
        +number rangeMeters
        +boolean active
        +Date createdAt
    }

    class Drone {
        +number id
        +string name
        +number latitude
        +number longitude
        +number towerId
        +string status
        +Date createdAt
    }

    class Waypoint {
        +number id
        +string name
        +number latitude
        +number longitude
        +Date createdAt
    }

    class User {
        +string id
        +string email
        +string role
        +string name
    }

    class TowerDTO {
        +number id
        +string name
        +number latitude
        +number longitude
        +number rangeMeters
        +boolean active
    }

    class DroneDTO {
        +number id
        +string name
        +number latitude
        +number longitude
        +number towerId
        +string status
    }

    class WaypointDTO {
        +number id
        +string name
        +number latitude
        +number longitude
    }

    class AuthOptions {
        +CredentialsProvider[] providers
        +Callbacks callbacks
        +string strategy
        +PagesConfig pages
    }

    class CredentialsProvider {
        +string email
        +string password
        +authorize() User
    }

    class Callbacks {
        +session() void
        +jwt() void
    }

    class JWTToken {
        +string id
        +string email
        +string role
    }

    class Session {
        +User user
        +string expires
    }

    %% Relationships
    Drone "0..*" --> "0..1" Tower : assigned to
    Tower "1" --> "0..*" Drone : manages
    
    %% DTO Mappings
    Tower ..> TowerDTO : maps to
    Drone ..> DroneDTO : maps to
    Waypoint ..> WaypointDTO : maps to
    
    %% User manages everything
    User --> Tower : manages
    User --> Drone : manages
    User --> Waypoint : manages

    %% Auth relationships
    AuthOptions --> CredentialsProvider : uses
    AuthOptions --> Callbacks : defines
    CredentialsProvider --> User : authenticates
    Callbacks --> JWTToken : manages
    Callbacks --> Session : manages
    JWTToken --> User : contains
    Session --> User : contains

    note for Drone "Status: inventory, deployed, inactive"
    note for User "Role: admin or user"
    note for AuthOptions "NextAuth Configuration"
    note for CredentialsProvider "Email/Password: admin@altitude.local"
```

## Entity Descriptions

### Authentication System (NextAuth)

**AuthOptions**
- Configuration for NextAuth authentication
- Defines providers, callbacks, and session strategy
- JWT-based session strategy

**CredentialsProvider**
- Implements email/password authentication
- Static admin credentials: `admin@altitude.local` / `admin123`
- Returns User object on successful authorization

**Callbacks**
- `session()`: Adds role information to session
- `jwt()`: Adds role information to JWT token

**JWTToken**
- Contains user id, email, and role
- Used for maintaining session state

**Session**
- Contains authenticated user information
- Expiration date for session validity

### Core Entities

**User**
- Authentication entity via NextAuth
- Roles: admin or user
- Admin users have full CRUD access

**Tower**
- Communication towers that define drone broadcast ranges
- Located at specific coordinates (latitude/longitude)
- Has a range in meters that determines coverage area
- Can be active or inactive

**Drone**
- Flying vehicles that can be in inventory or deployed
- When deployed, must be assigned to a tower
- Status can be: inventory, deployed, or inactive
- Location is optional (null when in inventory)

**Waypoint**
- Navigation destination points on the map
- Static locations with coordinates
- Independent of towers and drones

### Data Transfer Objects (DTOs)

DTOs are used for client-side serialization, converting database decimal types to numbers and handling null/undefined values for React components.

## Relationships

1. **Authentication Flow**:
   - CredentialsProvider authenticates users and returns User
   - Callbacks manage JWT tokens and sessions with role information
   
2. **Drone → Tower**: Many-to-one (optional)
   - A drone can be assigned to zero or one tower
   - A tower can manage multiple drones
   - Foreign key with SET NULL on delete

3. **User manages all entities**: One-to-many
   - Admin users can create, read, update, and delete all entities
