"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, ArrowRight, Info } from "lucide-react";
import { Choice, Field, Row, amount, options } from "./inventory-ui";
export type FormProps = {
  data: Row;
  modal: Row;
  onSave: (body: Row) => Promise<unknown>;
  onCancel: () => void;
};
export function ActionForm({ data, modal, onSave, onCancel }: FormProps) {
  const row = modal.row;
  const [f, setF] = useState<Row>(
    row
      ? {
          ...row,
          reorder_level: row.reorder_level / 1000,
          active: !!row.active,
        }
      : {
          active: true,
          role: "Warehouse Staff",
          reorder_level: 0,
          unit: "pcs",
          direction: "Negative",
        },
  );
  const [lines, setLines] = useState<Row[]>(
    modal.detail?.lines
      ?.map((l: Row) => ({
        line_id: l.id,
        product_id: l.product_id,
        product: l.product,
        sku: l.sku,
        unit: l.unit,
        quantity:
          modal.kind === "receive_po"
            ? (l.ordered - l.received) / 1000
            : l.quantity / 1000,
        remaining: l.ordered - l.received,
        location_id: "",
      }))
      .filter((l: Row) => modal.kind !== "receive_po" || l.remaining > 0) || [
      {
        key: crypto.randomUUID(),
        product_id: "",
        quantity: 1,
        source_location_id: "",
      },
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const update = (key: string, v: any) => {
    setF({ ...f, [key]: v });
    setError("");
  };
  const lineUpdate = (i: number, key: string, v: any) =>
    setLines(lines.map((l, j) => (i === j ? { ...l, [key]: v } : l)));
  const activeWarehouses = data.warehouses.filter((w: Row) => w.active);
  const activeProducts = data.products.filter((p: Row) => p.active);
  const locs = (w: string) =>
    data.locations
      .filter((l: Row) => l.active && l.warehouse_id === w)
      .map((l: Row) => ({ value: l.id, label: l.code }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let body: Row = {
        action: modal.kind,
        ...f,
        request_id: requestId.current,
      };
      if (modal.kind === "master")
        body = {
          action: "save_master",
          entity: modal.entity,
          id: row?.id,
          version: row?.version,
          data: f,
          request_id: requestId.current,
        };
      if (modal.kind === "create_po" || modal.kind === "create_transfer")
        body.lines = lines.map((l) => ({ ...l, quantity: Number(l.quantity) }));
      if (modal.kind === "receive_po" || modal.kind === "receive_transfer")
        body = {
          action: modal.kind,
          id: modal.detail.item.id,
          lines: lines
            .filter(
              (l) =>
                modal.kind === "receive_transfer" || Number(l.quantity) > 0,
            )
            .map((l) => ({
              line_id: l.line_id,
              quantity: Number(l.quantity),
              location_id: l.location_id,
            })),
          request_id: requestId.current,
        };
      await onSave(body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
    props: Row = {},
  ) => (
    <Field label={label + (required ? " *" : "")}>
      <input
        value={f[key] ?? ""}
        type={type}
        required={required}
        onChange={(e) => update(key, e.target.value)}
        maxLength={type === "text" ? 200 : undefined}
        {...props}
      />
    </Field>
  );
  return (
    <form onSubmit={submit} className="action-form">
      <div className="form-scroll">
        {modal.kind === "master" && (
          <>
            <div className="form-grid">
              {modal.entity !== "locations" &&
                input("name", modal.entity === "users" ? "Full name" : "Name")}
              {modal.entity === "warehouses" && input("code", "Warehouse code")}
              {modal.entity === "locations" && (
                <>
                  <Choice
                    label="Warehouse"
                    value={f.warehouse_id}
                    onChange={(v) => update("warehouse_id", v)}
                    items={options(activeWarehouses)}
                    disabled={!!row}
                    required
                  />
                  {input("code", "Location code")}
                </>
              )}
              {["locations", "warehouses"].includes(modal.entity) &&
                input("description", "Description", "text", false)}
              {modal.entity === "products" && (
                <>
                  {input("sku", "SKU")}
                  <Choice
                    label="Category"
                    value={f.category_id}
                    onChange={(v) => update("category_id", v)}
                    items={options(data.categories)}
                    required
                  />
                  {input("unit", "Unit of measure")}
                  {input("reorder_level", "Reorder level", "number", true, {
                    min: 0,
                    step: 0.001,
                  })}
                  {input("barcode", "Barcode", "text", false)}
                </>
              )}
              {modal.entity === "suppliers" && (
                <>
                  {input("contact", "Contact person", "text", false)}
                  {input("email", "Email", "email", false)}
                  {input("phone", "Phone", "tel", false)}
                </>
              )}
              {modal.entity === "users" && (
                <>
                  {input("email", "Email", "email")}
                  <Choice
                    label="Role"
                    value={f.role}
                    onChange={(v) => update("role", v)}
                    items={[
                      "Admin",
                      "Warehouse Manager",
                      "Warehouse Staff",
                    ].map((r) => ({ value: r, label: r }))}
                    required
                  />
                  {input(
                    "password",
                    row ? "New password (leave blank to keep)" : "Password",
                    "password",
                    !row,
                    {
                      minLength: 12,
                      maxLength: 128,
                      autoComplete: "new-password",
                    },
                  )}
                </>
              )}
            </div>
            {modal.entity !== "categories" && (
              <label className="toggle-row">
                <div>
                  <strong>Active</strong>
                  <p>Available for new operations</p>
                </div>
                <Switch
                  aria-label="Active"
                  checked={!!f.active}
                  onCheckedChange={(v) => update("active", v)}
                />
              </label>
            )}
            {modal.entity === "products" && (
              <p className="form-hint">
                <Info size={15} />
                Inventory is added through receiving or a stock adjustment.
              </p>
            )}
            {modal.entity === "users" && (
              <p className="form-hint">
                Passwords must contain at least 12 characters. Share account
                details securely.
              </p>
            )}
          </>
        )}
        {["create_po", "create_transfer"].includes(modal.kind) && (
          <>
            <div className="form-grid">
              {modal.kind === "create_po" ? (
                <>
                  <Choice
                    label="Supplier"
                    value={f.supplier_id}
                    onChange={(v) => update("supplier_id", v)}
                    items={options(data.suppliers.filter((s: Row) => s.active))}
                    required
                  />
                  <Choice
                    label="Receiving warehouse"
                    value={f.warehouse_id}
                    onChange={(v) => update("warehouse_id", v)}
                    items={options(activeWarehouses)}
                    required
                  />
                </>
              ) : (
                <>
                  <Choice
                    label="Source warehouse"
                    value={f.source_id}
                    onChange={(v) => {
                      update("source_id", v);
                      setLines(
                        lines.map((l) => ({ ...l, source_location_id: "" })),
                      );
                    }}
                    items={options(activeWarehouses)}
                    required
                  />
                  <Choice
                    label="Destination warehouse"
                    value={f.destination_id}
                    onChange={(v) => update("destination_id", v)}
                    items={options(
                      activeWarehouses.filter((w: Row) => w.id !== f.source_id),
                    )}
                    required
                  />
                </>
              )}
            </div>
            <div className="form-section-heading">
              <h3>Products</h3>
              <span>{lines.length} / 20 lines</span>
            </div>
            {lines.map((l, i) => (
              <div className="line-card" key={l.key || i}>
                <div className="line-number">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="line-fields">
                  <Choice
                    label="Product"
                    value={l.product_id}
                    onChange={(v) => lineUpdate(i, "product_id", v)}
                    items={activeProducts.map((p: Row) => ({
                      value: p.id,
                      label: p.name + " · " + p.sku,
                    }))}
                    required
                  />
                  <div className="form-grid">
                    {modal.kind === "create_transfer" && (
                      <Choice
                        label="Source location"
                        value={l.source_location_id}
                        onChange={(v) => lineUpdate(i, "source_location_id", v)}
                        items={locs(f.source_id)}
                        required
                      />
                    )}
                    <Field label="Quantity *">
                      <input
                        type="number"
                        min="0.001"
                        max="1000000000"
                        step="0.001"
                        required
                        value={l.quantity}
                        onChange={(e) =>
                          lineUpdate(i, "quantity", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                  {modal.kind === "create_transfer" &&
                    l.product_id &&
                    l.source_location_id && (
                      <span className="muted text-sm">
                        Available:{" "}
                        {amount(
                          data.inventory.find(
                            (v: Row) =>
                              v.product_id === l.product_id &&
                              v.location_id === l.source_location_id,
                          )?.quantity || 0,
                        )}
                      </span>
                    )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={lines.length >= 20}
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    key: crypto.randomUUID(),
                    product_id: "",
                    source_location_id: "",
                    quantity: 1,
                  },
                ])
              }
            >
              <Plus size={16} />
              Add product
            </Button>
            <Field label="Notes">
              <textarea
                rows={3}
                value={f.notes || ""}
                onChange={(e) => update("notes", e.target.value)}
                maxLength={1000}
              />
            </Field>
            <p className="form-hint">
              {modal.kind === "create_po"
                ? "Saved as a draft. Approve it before receiving goods."
                : "Saved as a draft. Stock moves to in transit only after dispatch."}
            </p>
          </>
        )}
        {["stock_out", "adjust"].includes(modal.kind) && (
          <>
            <div className="form-grid">
              <Choice
                label="Warehouse"
                value={f.warehouse_id}
                onChange={(v) => {
                  setF({ ...f, warehouse_id: v, location_id: "" });
                }}
                items={options(activeWarehouses)}
                required
              />
              <Choice
                label="Storage location"
                value={f.location_id}
                onChange={(v) => update("location_id", v)}
                items={locs(f.warehouse_id)}
                required
              />
            </div>
            <Choice
              label="Product"
              value={f.product_id}
              onChange={(v) => update("product_id", v)}
              items={activeProducts.map((p: Row) => ({
                value: p.id,
                label: p.name + " · " + p.sku,
              }))}
              required
            />
            {f.location_id && f.product_id && (
              <div className="available-box">
                <span>Available at this location</span>
                <strong>
                  {amount(
                    data.inventory.find(
                      (i: Row) =>
                        i.product_id === f.product_id &&
                        i.location_id === f.location_id,
                    )?.quantity || 0,
                  )}{" "}
                  <small>
                    {
                      data.products.find((p: Row) => p.id === f.product_id)
                        ?.unit
                    }
                  </small>
                </strong>
              </div>
            )}
            <div className="form-grid">
              {modal.kind === "adjust" && (
                <Choice
                  label="Adjustment type"
                  value={f.direction}
                  onChange={(v) => update("direction", v)}
                  items={[
                    { value: "Negative", label: "Negative · remove stock" },
                    { value: "Positive", label: "Positive · add stock" },
                  ]}
                  required
                />
              )}
              {input("quantity", "Quantity", "number", true, {
                min: 0.001,
                max: 1000000000,
                step: 0.001,
              })}
            </div>
            {modal.kind === "stock_out" ? (
              <>
                <Choice
                  label="Reason"
                  value={f.reason}
                  onChange={(v) => update("reason", v)}
                  items={[
                    "Internal Use",
                    "Damaged",
                    "Issued to Department",
                    "Other",
                  ].map((r) => ({ value: r, label: r }))}
                  required
                />
                {input(
                  "explanation",
                  f.reason === "Other" ? "Explanation" : "Additional notes",
                  "text",
                  f.reason === "Other",
                )}
              </>
            ) : (
              <Field label="Adjustment reason *">
                <textarea
                  required
                  rows={3}
                  maxLength={1000}
                  placeholder="Explain the physical count discrepancy or correction"
                  value={f.reason || ""}
                  onChange={(e) => update("reason", e.target.value)}
                />
              </Field>
            )}
            <p className="form-hint">
              <Info size={15} />
              This operation updates inventory immediately and creates a
              permanent movement record.
            </p>
          </>
        )}
        {["receive_po", "receive_transfer"].includes(modal.kind) && (
          <>
            <div className="receive-heading">
              <span>{modal.detail.item.number}</span>
              <strong>
                {
                  data.warehouses.find(
                    (w: Row) =>
                      w.id ===
                      (modal.kind === "receive_po"
                        ? modal.detail.item.warehouse_id
                        : modal.detail.item.destination_id),
                  )?.name
                }
              </strong>
            </div>
            {lines.map((l, i) => (
              <div key={l.line_id} className="receive-line">
                <div>
                  <strong>{l.product}</strong>
                  <span className="muted text-sm">{l.sku}</span>
                </div>
                <div className="form-grid">
                  <Field
                    label={
                      modal.kind === "receive_po"
                        ? `Receive now · ${amount(l.remaining)} remaining`
                        : "Quantity to receive"
                    }
                  >
                    <input
                      type="number"
                      min={0}
                      step=".001"
                      max={
                        modal.kind === "receive_po"
                          ? l.remaining / 1000
                          : undefined
                      }
                      value={l.quantity}
                      disabled={modal.kind === "receive_transfer"}
                      onChange={(e) =>
                        lineUpdate(i, "quantity", e.target.value)
                      }
                    />
                  </Field>
                  <Choice
                    label="Destination location"
                    value={l.location_id}
                    onChange={(v) => lineUpdate(i, "location_id", v)}
                    items={locs(
                      modal.kind === "receive_po"
                        ? modal.detail.item.warehouse_id
                        : modal.detail.item.destination_id,
                    )}
                    required={Number(l.quantity) > 0}
                  />
                </div>
              </div>
            ))}
            <p className="form-hint">
              {modal.kind === "receive_po"
                ? "Set a line to zero to receive it later. Quantities cannot exceed the remaining order."
                : "All lines must be received in full. Select a destination location for each product."}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
      </div>
      <div className="form-footer">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : modal.kind === "master"
              ? "Save changes"
              : modal.kind === "create_po"
                ? "Create purchase order"
                : modal.kind === "create_transfer"
                  ? "Create transfer"
                  : modal.kind === "stock_out"
                    ? "Issue stock"
                    : modal.kind === "adjust"
                      ? "Record adjustment"
                      : "Confirm receipt"}
          {!busy && <ArrowRight size={16} />}
        </Button>
      </div>
    </form>
  );
}
