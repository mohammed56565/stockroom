"use client";
import { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { PackageOpen } from "lucide-react";
export type Row = Record<string, any>;
export const amount = (n: number = 0) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(n / 1000);
export const date = (s: string) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
export const datetime = (s: string) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const stockStatus = (p: Row) =>
  p.available === 0
    ? "Out of Stock"
    : p.available <= p.reorder_level
      ? "Low Stock"
      : "In Stock";
export async function api(url: string, body?: Row): Promise<Row> {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Stockroom": "1" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error || "Unable to complete the request.");
  return data;
}
export function Choice({
  label,
  value,
  onChange,
  items,
  placeholder = "Select…",
  required = false,
  disabled = false,
}: {
  label: string;
  value?: string;
  onChange: (s: string) => void;
  items: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Select
        value={value || ""}
        onValueChange={onChange}
        required={required}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} className="w-full field-select">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
export const options = (rows: Row[], label = "name") =>
  rows.map((r) => ({ value: r.id, label: String(r[label]) }));
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Status({ value }: { value: string }) {
  const c = ["Active", "In Stock", "Received", "Closed"].includes(value)
    ? "green"
    : ["Low Stock", "Partially Received", "In Transit"].includes(value)
      ? "amber"
      : ["Out of Stock", "Inactive"].includes(value)
        ? "red"
        : value === "Approved"
          ? "blue"
          : "gray";
  return <span className={`status ${c}`}>{value}</span>;
}
export function Blank({
  title = "No records yet",
  description = "Records will appear here when you add them.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="blank">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function DataTable({
  columns,
  rows,
  keyField = "id",
  empty,
}: {
  columns: {
    label: string;
    render: (r: Row) => ReactNode;
    className?: string;
  }[];
  rows: Row[];
  keyField?: string;
  empty?: string;
}) {
  if (!rows.length)
    return (
      <Blank
        title={empty || "No matching records"}
        description="Try another search or filter, or create your first record."
      />
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c, i) => (
            <TableHead key={i} className={c.className}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={r[keyField] || i}>
            {columns.map((c, j) => (
              <TableCell key={j} className={c.className}>
                {c.render(r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function Pager({
  page,
  total,
  size = 12,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : "0 records"}
      </span>
      <Pagination className="m-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : 0}
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) onChange(page - 1);
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <span className="page-number">
              {page} / {pages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={page >= pages}
              tabIndex={page >= pages ? -1 : 0}
              onClick={(e) => {
                e.preventDefault();
                if (page < pages) onChange(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
