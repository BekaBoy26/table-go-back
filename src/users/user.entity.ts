export interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string | null;
  phone: string | null;
  avatar: string | null;
  role: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Public user shape — never includes the password hash. */
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    avatar: row.avatar,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
