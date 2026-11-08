// Dynamic SQL rows and workspace payloads share this record boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
};
