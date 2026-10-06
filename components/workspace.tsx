"use client";
import { useState, useEffect, useCallback, ReactNode } from "react";
import {
  PackageOpen,
  LayoutDashboard,
  Boxes,
  Warehouse,
  MapPin,
  Tags,
  Truck,
  ClipboardList,
  ArrowRightLeft,
  ArrowUpRight,
  SlidersHorizontal,
  History,
  Users,
  Plus,
  Search,
  LogOut,
  ChevronRight,
  RefreshCw,
  ArrowDownToLine,
  Activity,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  PackageMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Row,
  api,
  amount,
  date,
  datetime,
  stockStatus,
  Status,
  Choice,
  options,
  DataTable,
  Pager,
  Blank,
  Field,
} from "./inventory-ui";
import { ActionForm } from "./inventory-forms";
const nav = [
  {
    title: "OVERVIEW",
    items: [
      ["dashboard", "Dashboard", LayoutDashboard],
      ["inventory", "Inventory", Boxes],
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      ["purchase_orders", "Purchase orders", ClipboardList],
      ["stock_out", "Stock out", ArrowUpRight],
      ["transfers", "Warehouse transfers", ArrowRightLeft],
      ["adjustments", "Stock adjustments", SlidersHorizontal],
      ["movements", "Stock movements", History],
    ],
  },
  {
    title: "DIRECTORY",
    items: [
      ["products", "Products", PackageOpen],
      ["warehouses", "Warehouses", Warehouse],
      ["locations", "Storage locations", MapPin],
      ["categories", "Categories", Tags],
      ["suppliers", "Suppliers", Truck],
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      ["users", "Users & roles", Users],
      ["activity", "Activity history", Activity],
    ],
  },
];
const titles: Record<string, string> = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  purchase_orders: "Purchase orders",
  stock_out: "Stock out",
  transfers: "Warehouse transfers",
  adjustments: "Stock adjustments",
  movements: "Stock movements",
  products: "Products",
  warehouses: "Warehouses",
  locations: "Storage locations",
  categories: "Categories",
  suppliers: "Suppliers",
  users: "Users & roles",
  activity: "Activity history",
};
const descriptions: Record<string, string> = {
  dashboard: "Your warehouse operations at a glance.",
  inventory: "Available stock across warehouses and storage locations.",
  purchase_orders: "From supplier orders to the final receipt.",
  stock_out: "Issue stock with a reason and a complete movement record.",
  transfers: "Follow inventory from dispatch to destination.",
  adjustments: "Record physical count corrections with an audit trail.",
  movements: "Every receipt, issue, transfer, and correction.",
  products: "Your product catalog, units, and reorder levels.",
  warehouses: "Manage your warehouse network.",
  locations: "Organize the physical spaces within each warehouse.",
  categories: "Keep your product catalog organized.",
  suppliers: "The partners behind your incoming inventory.",
  users: "Manage accounts and access to warehouse operations.",
  activity: "A traceable history of operations and administrative changes.",
};
export default function Workspace() {
  const [auth, setAuth] = useState<Row | null>(null);
  const [data, setData] = useState<Row | null>(null);
  const [section, setSection] = useState("dashboard");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    const d = await api("/api/data");
    setData(d);
    setRevision((v) => v + 1);
    setError("");
    return d;
  }, []);
  useEffect(() => {
    api("/api/auth")
      .then(async (a) => {
        setAuth(a);
        if (a.user) await load();
      })
      .catch((e) => setError(e.message));
    const sync = () => {
      const s = location.hash.slice(1);
      if (titles[s]) setSection(s);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [load]);
  const go = useCallback((s: string) => {
    setSection(s);
    location.hash = s;
  }, []);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool || !data) return;
    const lifecycle = new AbortController();
    const register = (tool: Row) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "view_inventory",
      title: "View inventory",
      description:
        "Navigate to the inventory table and return current product availability. This does not change stock.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("No parameters are accepted.");
        go("inventory");
        return {
          products: data.products.map((p: Row) => ({
            sku: p.sku,
            name: p.name,
            available: p.available / 1000,
            inTransit: p.transit / 1000,
            status: stockStatus(p),
          })),
        };
      },
    });
    register({
      name: "start_purchase_order",
      title: "Start purchase order",
      description:
        "Open the purchase order form. The user must complete and submit it to create an order.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("No parameters are accepted.");
        if (data.user.role === "Warehouse Staff")
          throw new Error("Manager access is required.");
        setModal({ kind: "create_po" });
        return { formOpened: true };
      },
    });
    return () => lifecycle.abort();
  }, [data, go]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };
  const openDetail = async (entity: string, id: string) => {
    setDetail({ entity, id, loading: true });
    try {
      const d = await api(
        "/api/data?kind=detail&entity=" + entity + "&id=" + id,
      );
      setDetail({ entity, id, ...d });
    } catch (e: any) {
      toast.error(e.message);
      setDetail(null);
    }
  };
  const save = async (body: Row) => {
    const result = await api("/api/action", body);
    await load();
    setModal(null);
    toast.success("Changes saved");
    if (detail) await openDetail(detail.entity, detail.id);
    return result;
  };
  const confirmAction = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      await save({ ...confirm.body, request_id: confirm.request_id });
      setConfirm(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const requestAction = (
    action: string,
    id: string,
    title: string,
    description: string,
  ) =>
    setConfirm({
      body: { action, id },
      title,
      description,
      request_id: crypto.randomUUID(),
    });
  const receive = async (entity: string, id: string) => {
    try {
      const d = await api(`/api/data?kind=detail&entity=${entity}&id=${id}`);
      setModal({
        kind: entity === "purchase_orders" ? "receive_po" : "receive_transfer",
        detail: d,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  if (!auth)
    return (
      <div className="initial-state">
        <PackageOpen size={40} />
        <h2>Stockroom</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => location.reload()}>Try again</Button>
          </>
        ) : (
          <Skeleton className="h-3 w-48" />
        )}
      </div>
    );
  if (!auth.user)
    return (
      <Login
        setup={auth.setupRequired}
        onLogin={async (u) => {
          setAuth({ user: u });
          await load();
        }}
      />
    );
  if (!data)
    return (
      <div className="initial-state">
        <PackageOpen size={40} />
        <h2>Opening your workspace</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={refresh}>Try again</Button>
          </>
        ) : (
          <Skeleton className="h-3 w-48" />
        )}
      </div>
    );
  const manager = data.user.role !== "Warehouse Staff",
    admin = data.user.role === "Admin";
  const allowed = (id: string) =>
    id === "users"
      ? admin
      : ["adjustments", "activity"].includes(id)
        ? manager
        : true;
  const newAction = () => {
    if (section === "purchase_orders") setModal({ kind: "create_po" });
    else if (section === "transfers") setModal({ kind: "create_transfer" });
    else if (section === "stock_out") setModal({ kind: "stock_out" });
    else if (section === "adjustments") setModal({ kind: "adjust" });
    else setModal({ kind: "master", entity: section });
  };
  const canCreate = [
    "products",
    "categories",
    "suppliers",
    "locations",
    "purchase_orders",
    "transfers",
    "adjustments",
  ].includes(section)
    ? manager
    : ["warehouses", "users"].includes(section)
      ? admin
      : section === "stock_out";
  const newLabel =
    section === "stock_out"
      ? "Issue stock"
      : section === "adjustments"
        ? "New adjustment"
        : section === "purchase_orders"
          ? "Purchase order"
          : section === "transfers"
            ? "Create transfer"
            : section === "categories"
              ? "Category"
              : section === "warehouses"
                ? "Warehouse"
                : section === "locations"
                  ? "Storage location"
                  : section === "suppliers"
                    ? "Supplier"
                    : section === "users"
                      ? "Add user"
                      : "Product";
  return (
    <>
      <Toaster richColors position="bottom-right" />
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className="app-sidebar-head">
            <div className="brand">
              <PackageOpen size={28} />
              <span>
                stockroom<span className="brand-dot">.</span>
              </span>
            </div>
            <div className="workspace-label">Warehouse workspace</div>
          </SidebarHeader>
          <SidebarContent>
            {nav.map((g) => (
              <SidebarGroup key={g.title}>
                <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
                <SidebarMenu>
                  {g.items
                    .filter(([id]) => allowed(String(id)))
                    .map(([id, label, Icon]: any) => (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton
                          isActive={section === id}
                          tooltip={label}
                          onClick={() => go(id)}
                          className="nav-item"
                        >
                          <Icon size={18} />
                          <span>{label}</span>
                          {id === "transfers" && data.stats.transfers > 0 && (
                            <span className="nav-count">
                              {data.stats.transfers}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <div className="sidebar-person">
              <span className="avatar">
                {data.user.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{data.user.name}</strong>
                <span>{data.user.role}</span>
              </div>
              <button
                aria-label="Sign out"
                onClick={async () => {
                  await api("/api/auth", { action: "logout" });
                  setData(null);
                  setAuth({ user: null, setupRequired: false });
                }}
              >
                <LogOut size={17} />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="topbar">
            <div>
              <SidebarTrigger />
              <span className="topbar-parent">Workspace</span>
              <ChevronRight size={14} />
              <span>{titles[section]}</span>
            </div>
            <div>
              <span className="today">{date(new Date().toISOString())}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh data"
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshCw size={17} className={refreshing ? "spin" : ""} />
              </Button>
            </div>
          </header>
          <main className="workspace-main">
            <div className="page-heading">
              <div>
                <p className="page-overline">
                  {section === "dashboard"
                    ? "OPERATIONAL OVERVIEW"
                    : "WAREHOUSE MANAGEMENT"}
                </p>
                <h1>{titles[section]}</h1>
                <p>{descriptions[section]}</p>
              </div>
              <div className="heading-actions">
                {section === "dashboard" ? (
                  <>
                    {manager && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          go("purchase_orders");
                        }}
                      >
                        <ArrowDownToLine size={16} />
                        Receive goods
                      </Button>
                    )}
                    {manager ? (
                      <Button onClick={() => setModal({ kind: "create_po" })}>
                        <Plus size={17} />
                        Purchase order
                      </Button>
                    ) : (
                      <Button onClick={() => go("purchase_orders")}>
                        <ArrowDownToLine size={16} />
                        Receive goods
                      </Button>
                    )}
                  </>
                ) : (
                  canCreate && (
                    <Button onClick={newAction}>
                      <Plus size={17} />
                      {newLabel}
                    </Button>
                  )
                )}
              </div>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <Button variant="ghost" onClick={refresh}>
                  Retry
                </Button>
              </div>
            )}
            {!allowed(section) ? (
              <Blank
                title="Manager access required"
                description="Choose an available page from the navigation."
              />
            ) : section === "dashboard" ? (
              <Dashboard data={data} go={go} openDetail={openDetail} />
            ) : ["movements", "stock_out", "adjustments", "activity"].includes(
                section,
              ) ? (
              <HistoryView section={section} data={data} revision={revision} />
            ) : (
              <Records
                key={section}
                section={section}
                data={data}
                canEdit={canCreate}
                onEdit={(row: Row) =>
                  setModal({ kind: "master", entity: section, row })
                }
                openDetail={openDetail}
                receive={receive}
                requestAction={requestAction}
                go={go}
              />
            )}
            <footer className="workspace-footer">
              <span>Stockroom · Warehouse inventory</span>
              <span>
                Stock is available inventory only. In-transit units are tracked
                separately.
              </span>
            </footer>
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="operation-dialog" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {modal?.kind === "master"
                ? `${modal.row ? "Edit" : "New"} ${modal.entity === "categories" ? "category" : modal.entity === "locations" ? "storage location" : modal.entity === "users" ? "user" : modal.entity?.slice(0, -1)}`
                : modal?.kind === "create_po"
                  ? "Create purchase order"
                  : modal?.kind === "create_transfer"
                    ? "Create warehouse transfer"
                    : modal?.kind === "stock_out"
                      ? "Issue stock"
                      : modal?.kind === "adjust"
                        ? "Record stock adjustment"
                        : "Receive inventory"}
            </DialogTitle>
            <DialogDescription>
              {modal?.kind === "master"
                ? "Manage the details used in your warehouse operations."
                : "Check the details before confirming this operation."}
            </DialogDescription>
          </DialogHeader>
          {modal && (
            <ActionForm
              key={`${modal.kind}-${modal.entity}-${modal.row?.id || modal.detail?.item?.id || "new"}`}
              data={data}
              modal={modal}
              onSave={save}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>
              {detail?.item?.number ||
                detail?.item?.name ||
                detail?.item?.code ||
                "Record details"}
            </SheetTitle>
            <SheetDescription>
              {titles[detail?.entity] || "Inventory"} details and activity
            </SheetDescription>
          </SheetHeader>
          {detail?.loading ? (
            <div className="p-6">
              <Skeleton className="h-32" />
            </div>
          ) : (
            detail && (
              <Details
                detail={detail}
                data={data}
                receive={receive}
                requestAction={requestAction}
                onEdit={() => {
                  setModal({
                    kind: "master",
                    entity: detail.entity,
                    row: detail.item,
                  });
                }}
              />
            )
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !saving) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button disabled={saving} onClick={confirmAction}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function Login({
  setup,
  onLogin,
}: {
  setup: boolean;
  onLogin: (u: Row) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="welcome">
      <section className="welcome-story">
        <div className="brand">
          <PackageOpen size={32} />
          <span>
            stockroom<span className="brand-dot">.</span>
          </span>
        </div>
        <div>
          <p className="eyebrow">WAREHOUSE OPERATIONS</p>
          <h1>
            A clear view.
            <br />
            Every location.
            <br />
            Every movement.
          </h1>
          <p className="lede">
            One workspace for your inventory, purchase orders, and warehouse
            operations.
          </p>
          <div className="welcome-features">
            <span>
              <Warehouse />
              Multi-warehouse inventory
            </span>
            <span>
              <ArrowRightLeft />
              Traceable stock movements
            </span>
            <span>
              <ShieldCheck />
              Controlled access
            </span>
          </div>
        </div>
        <p className="subtle">PURCHASE · RECEIVE · STORE · MOVE</p>
      </section>
      <section className="welcome-form">
        <div className="login-card">
          <span className="icon-box">
            <PackageOpen />
          </span>
          <h2>{setup ? "Set up your workspace" : "Welcome back"}</h2>
          <p>
            {setup
              ? "Create your administrator account to start managing inventory."
              : "Sign in to your Stockroom account."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const f = new FormData(e.currentTarget);
                const d = await api("/api/auth", {
                  action: setup ? "setup" : "login",
                  name: f.get("name"),
                  email: f.get("email"),
                  password: f.get("password"),
                });
                await onLogin(d.user);
              } catch (err: any) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 12 : undefined}
                maxLength={128}
                placeholder={
                  setup ? "At least 12 characters" : "Enter your password"
                }
                required
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button disabled={busy}>
              {busy
                ? "Please wait…"
                : setup
                  ? "Create workspace →"
                  : "Sign in →"}
            </button>
          </form>
          <p className="login-note">
            {setup
              ? "You will be the first administrator. Additional users can be added in Users & roles."
              : "Need access? Contact your warehouse administrator."}
          </p>
        </div>
      </section>
    </main>
  );
}
function Dashboard({
  data,
  go,
  openDetail,
}: {
  data: Row;
  go: (s: string) => void;
  openDetail: (e: string, id: string) => void;
}) {
  const s = data.stats;
  const cards = [
    ["Active products", s.products, "products", PackageOpen, "blue"],
    ["Available units", amount(s.units), "inventory", Boxes, "blue"],
    ["Low stock products", s.low, "inventory", AlertTriangle, "amber"],
    ["Out of stock", s.out, "inventory", PackageMinus, "red"],
    [
      "Pending purchase orders",
      s.pending,
      "purchase_orders",
      ClipboardList,
      "blue",
    ],
    ["Transfers in transit", s.transfers, "transfers", Truck, "teal"],
  ];
  const alerts = data.products
    .filter((p: Row) => p.active && p.available <= p.reorder_level)
    .sort((a: Row, b: Row) => a.available - b.available)
    .slice(0, 5);
  const trend = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - 6 + i);
    const key = dt.toISOString().slice(0, 10);
    const r = data.trend.find((d: Row) => d.day === key);
    return {
      day: dt.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }),
      incoming: (r?.incoming || 0) / 1000,
      outgoing: (r?.outgoing || 0) / 1000,
    };
  });
  return (
    <>
      {data.warehouses.length === 0 && (
        <div className="setup-banner">
          <span className="icon-box">
            <Warehouse />
          </span>
          <div>
            <strong>Start with your first warehouse</strong>
            <p>
              Add a warehouse and storage locations, then build your catalog and
              create a purchase order.
            </p>
          </div>
          <Button variant="outline" onClick={() => go("warehouses")}>
            Set up warehouses
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
      <div className="kpi-grid">
        {cards.map(([label, value, target, Icon, color]: any) => (
          <button key={label} className="kpi-card" onClick={() => go(target)}>
            <div>
              <span>{label}</span>
              <Icon className={`kpi-icon ${color}`} size={19} />
            </div>
            <strong>{value}</strong>
            <span className="kpi-caption">
              {label === "Available units"
                ? "Excludes inventory in transit"
                : label === "Pending purchase orders"
                  ? "Approved through received"
                  : label === "Transfers in transit"
                    ? `${amount(s.transit)} units on the move`
                    : "Across your warehouse network"}
            </span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Stock activity</h2>
              <p>Incoming and outgoing units · last 7 days (UTC)</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-in" />
                Incoming
              </span>
              <span>
                <i className="legend-out" />
                Outgoing
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={238}>
              <BarChart data={trend} barGap={5}>
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#e8edf4"
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#718096" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#718096" }}
                  width={43}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e1e7f0",
                    borderRadius: 8,
                  }}
                />
                <Bar
                  dataKey="incoming"
                  name="Incoming"
                  fill="#2159d5"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={25}
                />
                <Bar
                  dataKey="outgoing"
                  name="Outgoing"
                  fill="#86b9df"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={25}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel distribution-panel">
          <div className="panel-heading">
            <div>
              <h2>Stock by warehouse</h2>
              <p>Available units across all locations</p>
            </div>
            <Warehouse size={20} className="muted" />
          </div>
          {data.distribution.length ? (
            <div className="warehouse-distribution">
              {data.distribution.map((w: Row, i: number) => (
                <div key={w.id}>
                  <div className="distribution-label">
                    <button onClick={() => openDetail("warehouses", w.id)}>
                      <span className={`warehouse-marker marker-${i % 3}`}>
                        {w.code.slice(0, 2)}
                      </span>
                      <span>{w.name}</span>
                    </button>
                    <strong>{amount(w.quantity)}</strong>
                  </div>
                  <div className="distribution-track">
                    <span
                      style={{
                        width: `${s.units ? (w.quantity / s.units) * 100 : 0}%`,
                        background: ["#2159d5", "#1d9aa7", "#91b9ed"][i % 3],
                      }}
                    />
                  </div>
                  <div className="distribution-caption">
                    <span>{w.products} stocked products</span>
                    <span>
                      {s.units ? Math.round((w.quantity / s.units) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Blank
              title="No warehouses yet"
              description="Set up your warehouses to see stock distribution."
            />
          )}
          <div className="transit-note">
            <Truck size={18} />
            <span>
              <strong>{amount(s.transit)}</strong> units in transit
            </span>
            <button onClick={() => go("transfers")}>
              View transfers
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-grid bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent stock movements</h2>
              <p>The latest changes to your inventory</p>
            </div>
            <button className="text-link" onClick={() => go("movements")}>
              View all
              <ArrowRight size={15} />
            </button>
          </div>
          <MovementTable rows={data.movements} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Needs attention{" "}
                <span className="count-badge">{s.low + s.out}</span>
              </h2>
              <p>Products at or below reorder level</p>
            </div>
          </div>
          {alerts.length ? (
            <div className="attention-list">
              {alerts.map((p: Row) => (
                <button key={p.id} onClick={() => openDetail("products", p.id)}>
                  <span className="product-icon">
                    <PackageOpen size={19} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </span>
                  <span>
                    <strong
                      className={p.available === 0 ? "danger" : "warning"}
                    >
                      {amount(p.available)} <small>{p.unit}</small>
                    </strong>
                    <small>Reorder at {amount(p.reorder_level)}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Blank
              title={
                data.products.length
                  ? "Stock levels look good"
                  : "Your catalog starts here"
              }
              description={
                data.products.length
                  ? "No active products are at or below their reorder level."
                  : "Add products and define reorder levels to monitor availability."
              }
            />
          )}
          <button className="panel-bottom-link" onClick={() => go("inventory")}>
            Review inventory
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
function MovementTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      rows={rows}
      empty="No stock movements yet"
      columns={[
        {
          label: "Product",
          render: (r) => (
            <div className="cell-title">
              {r.product}
              <small>{r.sku}</small>
            </div>
          ),
        },
        {
          label: "Movement",
          render: (r) => (
            <span className="movement-type">
              {r.type.replaceAll("_", " ").toLowerCase()}
            </span>
          ),
        },
        {
          label: "Location",
          render: (r) => (
            <div className="cell-title">
              {r.warehouse_code}
              <small>{r.location}</small>
            </div>
          ),
        },
        {
          label: "Quantity",
          className: "numeric",
          render: (r) => (
            <strong className={r.quantity > 0 ? "positive" : "negative"}>
              {r.quantity > 0 ? "+" : ""}
              {amount(r.quantity)}
            </strong>
          ),
        },
        {
          label: "When",
          render: (r) => (
            <span className="muted nowrap">{datetime(r.created_at)}</span>
          ),
        },
      ]}
    />
  );
}
function Records({
  section,
  data,
  canEdit,
  onEdit,
  openDetail,
  receive,
  requestAction,
  go,
}: {
  section: string;
  data: Row;
  canEdit: boolean;
  onEdit: (r: Row) => void;
  openDetail: (e: string, id: string) => void;
  receive: (e: string, id: string) => void;
  requestAction: (a: string, id: string, t: string, d: string) => void;
  go: (s: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Row>({});
  const [page, setPage] = useState(1);
  const [expand, setExpand] = useState<string | null>(null);
  const change = (key: string, value: string) => {
    setFilter({
      ...filter,
      [key]: value,
      ...(key === "warehouse" ? { location: "all" } : {}),
    });
    setPage(1);
  };
  const manager = data.user.role !== "Warehouse Staff";
  let rows: Row[] =
    section === "inventory"
      ? data.products
      : section === "purchase_orders"
        ? data.orders
        : data[section] || [];
  rows = rows.filter((r) => {
    const term = search.toLowerCase();
    if (
      term &&
      ![
        r.name,
        r.sku,
        r.number,
        r.code,
        r.email,
        r.supplier,
        r.source,
        r.destination,
      ].some((s) =>
        String(s || "")
          .toLowerCase()
          .includes(term),
      )
    )
      return false;
    if (
      filter.category &&
      filter.category !== "all" &&
      r.category_id !== filter.category
    )
      return false;
    if (filter.status && filter.status !== "all") {
      const status =
        section === "inventory"
          ? stockStatus(r)
          : ["purchase_orders", "transfers"].includes(section)
            ? r.status
            : r.active
              ? "Active"
              : "Inactive";
      if (status !== filter.status) return false;
    }
    if (
      section === "inventory" &&
      ((filter.warehouse && filter.warehouse !== "all") ||
        (filter.location && filter.location !== "all")) &&
      !data.inventory.some(
        (i: Row) =>
          i.product_id === r.id &&
          (!filter.warehouse ||
            filter.warehouse === "all" ||
            i.warehouse_id === filter.warehouse) &&
          (!filter.location ||
            filter.location === "all" ||
            i.location_id === filter.location),
      )
    )
      return false;
    if (
      section !== "inventory" &&
      filter.warehouse &&
      filter.warehouse !== "all" &&
      r.warehouse_id !== filter.warehouse
    )
      return false;
    if (
      filter.supplier &&
      filter.supplier !== "all" &&
      r.supplier_id !== filter.supplier
    )
      return false;
    if (
      filter.source &&
      filter.source !== "all" &&
      r.source_id !== filter.source
    )
      return false;
    if (
      filter.destination &&
      filter.destination !== "all" &&
      r.destination_id !== filter.destination
    )
      return false;
    return true;
  });
  const columns: {
    label: string;
    render: (r: Row) => ReactNode;
    className?: string;
  }[] = [];
  const edit = (r: Row) =>
    canEdit ? (
      <Button variant="ghost" size="sm" onClick={() => onEdit(r)}>
        Edit
      </Button>
    ) : null;
  const link = (label: string, entity: string, r: Row) => (
    <button className="record-link" onClick={() => openDetail(entity, r.id)}>
      {label}
    </button>
  );
  if (section === "inventory")
    columns.push(
      {
        label: "Product / SKU",
        render: (r) => (
          <div className="product-cell">
            <span className="product-icon">
              <PackageOpen size={18} />
            </span>
            <div>
              {link(r.name, "products", r)}
              <small>{r.sku}</small>
            </div>
          </div>
        ),
      },
      { label: "Category", render: (r) => r.category },
      {
        label:
          filter.location && filter.location !== "all"
            ? "Selected location"
            : filter.warehouse && filter.warehouse !== "all"
              ? "Selected warehouse"
              : "Available",
        className: "numeric",
        render: (r) => (
          <strong>
            {amount(
              filter.warehouse && filter.warehouse !== "all"
                ? data.inventory
                    .filter(
                      (i: Row) =>
                        i.product_id === r.id &&
                        i.warehouse_id === filter.warehouse &&
                        (!filter.location ||
                          filter.location === "all" ||
                          i.location_id === filter.location),
                    )
                    .reduce((s: number, i: Row) => s + i.quantity, 0)
                : filter.location && filter.location !== "all"
                  ? data.inventory
                      .filter(
                        (i: Row) =>
                          i.product_id === r.id &&
                          i.location_id === filter.location,
                      )
                      .reduce((s: number, i: Row) => s + i.quantity, 0)
                  : r.available,
            )}{" "}
            <small>{r.unit}</small>
          </strong>
        ),
      },
      {
        label: "In transit",
        className: "numeric",
        render: (r) => amount(r.transit),
      },
      {
        label: "Reorder level",
        className: "numeric",
        render: (r) => amount(r.reorder_level),
      },
      {
        label: "Global status",
        render: (r) => <Status value={stockStatus(r)} />,
      },
      {
        label: "",
        render: (r) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setExpand(expand === r.id ? null : r.id);
            }}
          >
            Locations
            <ChevronDown size={14} />
          </Button>
        ),
      },
    );
  if (section === "products")
    columns.push(
      {
        label: "Product",
        render: (r) => (
          <div className="cell-title">
            {link(r.name, "products", r)}
            <small>{r.sku}</small>
          </div>
        ),
      },
      { label: "Category", render: (r) => r.category },
      { label: "Unit", render: (r) => r.unit },
      { label: "Reorder level", render: (r) => amount(r.reorder_level) },
      { label: "Available", render: (r) => amount(r.available) },
      {
        label: "Status",
        render: (r) => <Status value={r.active ? "Active" : "Inactive"} />,
      },
      { label: "", render: edit },
    );
  if (section === "warehouses")
    columns.push(
      {
        label: "Warehouse",
        render: (r) => (
          <div className="product-cell">
            <span className="product-icon">
              <Warehouse size={20} />
            </span>
            <div>
              {link(r.name, "warehouses", r)}
              <small>{r.description || r.code}</small>
            </div>
          </div>
        ),
      },
      { label: "Code", render: (r) => <span className="code">{r.code}</span> },
      {
        label: "Storage locations",
        render: (r) =>
          data.locations.filter((l: Row) => l.warehouse_id === r.id).length,
      },
      {
        label: "Available units",
        render: (r) =>
          amount(
            data.distribution.find((w: Row) => w.id === r.id)?.quantity || 0,
          ),
      },
      {
        label: "Status",
        render: (r) => <Status value={r.active ? "Active" : "Inactive"} />,
      },
      { label: "", render: edit },
    );
  if (section === "locations")
    columns.push(
      { label: "Location", render: (r) => link(r.code, "locations", r) },
      { label: "Warehouse", render: (r) => r.warehouse },
      { label: "Description", render: (r) => r.description || "—" },
      {
        label: "Available units",
        render: (r) =>
          amount(
            data.inventory
              .filter((i: Row) => i.location_id === r.id)
              .reduce((s: number, i: Row) => s + i.quantity, 0),
          ),
      },
      {
        label: "Status",
        render: (r) => <Status value={r.active ? "Active" : "Inactive"} />,
      },
      { label: "", render: edit },
    );
  if (section === "categories")
    columns.push(
      { label: "Category", render: (r) => <strong>{r.name}</strong> },
      {
        label: "Products",
        render: (r) =>
          data.products.filter((p: Row) => p.category_id === r.id).length,
      },
      { label: "Created", render: (r) => date(r.created_at) },
      { label: "", render: edit },
    );
  if (section === "suppliers")
    columns.push(
      { label: "Supplier", render: (r) => link(r.name, "suppliers", r) },
      { label: "Contact person", render: (r) => r.contact || "—" },
      { label: "Email", render: (r) => r.email || "—" },
      { label: "Phone", render: (r) => r.phone || "—" },
      {
        label: "Status",
        render: (r) => <Status value={r.active ? "Active" : "Inactive"} />,
      },
      { label: "", render: edit },
    );
  if (section === "users")
    columns.push(
      {
        label: "User",
        render: (r) => (
          <div className="cell-title">
            <strong>{r.name}</strong>
            <small>{r.email}</small>
          </div>
        ),
      },
      {
        label: "Role",
        render: (r) => (
          <span className="role-chip">
            <ShieldCheck size={14} />
            {r.role}
          </span>
        ),
      },
      {
        label: "Status",
        render: (r) => <Status value={r.active ? "Active" : "Inactive"} />,
      },
      { label: "Created", render: (r) => date(r.created_at) },
      { label: "", render: edit },
    );
  if (section === "purchase_orders")
    columns.push(
      {
        label: "Purchase order",
        render: (r) => (
          <div className="cell-title">
            {link(r.number, "purchase_orders", r)}
            <small>{date(r.created_at)}</small>
          </div>
        ),
      },
      { label: "Supplier", render: (r) => r.supplier },
      { label: "Warehouse", render: (r) => r.warehouse },
      {
        label: "Received / ordered",
        render: (r) => (
          <div className="receipt-progress">
            <span>
              {amount(r.received)} / {amount(r.ordered)}
            </span>
            <div>
              <i
                style={{
                  width: `${r.ordered ? (r.received / r.ordered) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ),
      },
      { label: "Status", render: (r) => <Status value={r.status} /> },
      {
        label: "Next action",
        render: (r) => (
          <div className="row-actions">
            {r.status === "Draft" && manager ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  requestAction(
                    "approve_po",
                    r.id,
                    "Approve purchase order?",
                    `${r.number} will be approved and available for receiving.`,
                  )
                }
              >
                Approve
              </Button>
            ) : ["Approved", "Partially Received"].includes(r.status) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => receive("purchase_orders", r.id)}
              >
                Receive
              </Button>
            ) : r.status === "Received" && manager ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  requestAction(
                    "close_po",
                    r.id,
                    "Close purchase order?",
                    `${r.number} is fully received. Closing preserves it as a read-only record.`,
                  )
                }
              >
                Close order
              </Button>
            ) : (
              <span className="muted">
                {r.status === "Closed" ? "Complete" : "Awaiting approval"}
              </span>
            )}
          </div>
        ),
      },
    );
  if (section === "transfers")
    columns.push(
      {
        label: "Transfer",
        render: (r) => (
          <div className="cell-title">
            {link(r.number, "transfers", r)}
            <small>{date(r.created_at)}</small>
          </div>
        ),
      },
      {
        label: "Route",
        render: (r) => (
          <div className="route">
            <span>{r.source}</span>
            <ArrowRight size={15} />
            <span>{r.destination}</span>
          </div>
        ),
      },
      { label: "Units", render: (r) => amount(r.quantity) },
      { label: "Status", render: (r) => <Status value={r.status} /> },
      {
        label: "Next action",
        render: (r) =>
          r.status === "Draft" && manager ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                requestAction(
                  "dispatch_transfer",
                  r.id,
                  "Dispatch this transfer?",
                  `${amount(r.quantity)} units will leave available source stock and be tracked in transit.`,
                )
              }
            >
              Dispatch
            </Button>
          ) : r.status === "In Transit" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => receive("transfers", r.id)}
            >
              Receive
            </Button>
          ) : (
            <span className="muted">
              {r.status === "Received" ? "Complete" : "Awaiting dispatch"}
            </span>
          ),
      },
    );
  const statuses =
    section === "inventory"
      ? ["In Stock", "Low Stock", "Out of Stock"]
      : section === "purchase_orders"
        ? ["Draft", "Approved", "Partially Received", "Received", "Closed"]
        : section === "transfers"
          ? ["Draft", "In Transit", "Received"]
          : section === "categories"
            ? []
            : ["Active", "Inactive"];
  const choice = (
    label: string,
    key: string,
    items: { value: string; label: string }[],
  ) => (
    <Choice
      label={label}
      value={filter[key] || "all"}
      onChange={(v) => change(key, v)}
      items={[{ value: "all", label: `All ${label.toLowerCase()}` }, ...items]}
    />
  );
  const pageSafe = Math.min(page, Math.max(1, Math.ceil(rows.length / 12)));
  const expandedProduct = data.products.find((p: Row) => p.id === expand);
  return (
    <>
      <section className="panel records-panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search records"
              placeholder={
                section === "inventory" || section === "products"
                  ? "Search products or SKU…"
                  : `Search ${titles[section].toLowerCase()}…`
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <span className="record-count">
            {rows.length} {section === "inventory" ? "products" : "records"}
          </span>
        </div>
        <div className="filter-row">
          {statuses.length > 0 &&
            choice(
              "Statuses",
              "status",
              statuses.map((s) => ({ value: s, label: s })),
            )}
          {["inventory", "products"].includes(section) &&
            choice("Categories", "category", options(data.categories))}
          {["inventory", "locations", "purchase_orders"].includes(section) &&
            choice("Warehouses", "warehouse", options(data.warehouses))}
          {section === "inventory" &&
            choice(
              "Locations",
              "location",
              data.locations
                .filter(
                  (l: Row) =>
                    !filter.warehouse ||
                    filter.warehouse === "all" ||
                    l.warehouse_id === filter.warehouse,
                )
                .map((l: Row) => ({
                  value: l.id,
                  label: l.warehouse_code + " / " + l.code,
                })),
            )}
          {section === "purchase_orders" &&
            choice("Suppliers", "supplier", options(data.suppliers))}
          {section === "transfers" && (
            <>
              {choice("Source warehouses", "source", options(data.warehouses))}
              {choice(
                "Destination warehouses",
                "destination",
                options(data.warehouses),
              )}
            </>
          )}
          {Object.values(filter).some((v) => v !== "all") && (
            <button
              className="text-link clear-filter"
              onClick={() => {
                setFilter({});
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {section === "inventory" && (
          <p className="table-note">
            Stock status uses the total available quantity across all
            warehouses. Click Locations to inspect individual storage
            quantities.
          </p>
        )}
        <DataTable
          columns={columns}
          rows={rows.slice((pageSafe - 1) * 12, pageSafe * 12)}
        />
        <Pager page={pageSafe} total={rows.length} onChange={setPage} />
      </section>
      {expandedProduct && section === "inventory" && (
        <section className="panel expanded-inventory">
          <div className="panel-heading">
            <div>
              <h2>{expandedProduct.name}</h2>
              <p>Stock by storage location · {expandedProduct.sku}</p>
            </div>
            <Button variant="ghost" onClick={() => setExpand(null)}>
              Close
            </Button>
          </div>
          <DataTable
            rows={data.inventory.filter((i: Row) => i.product_id === expand)}
            keyField="location_id"
            columns={[
              { label: "Warehouse", render: (r) => r.warehouse },
              {
                label: "Location",
                render: (r) => <span className="code">{r.location}</span>,
              },
              {
                label: "Available quantity",
                render: (r) => (
                  <strong>
                    {amount(r.quantity)} {expandedProduct.unit}
                  </strong>
                ),
              },
            ]}
          />
        </section>
      )}
    </>
  );
}
function HistoryView({
  section,
  data,
  revision,
}: {
  section: string;
  data: Row;
  revision: number;
}) {
  const [filter, setFilter] = useState<Row>({});
  const [result, setResult] = useState<Row>({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setPage(1);
    setFilter({});
  }, [section]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams({
      kind: section === "activity" ? "activity" : "history",
      page: String(page),
    });
    Object.entries(filter).forEach(([k, v]) => {
      if (v && v !== "all") p.set(k, String(v));
    });
    if (section === "stock_out") p.set("type", "STOCK_OUT");
    if (section === "adjustments") p.set("adjustments", "1");
    api("/api/data?" + p)
      .then((d) => {
        if (!cancelled) {
          setResult(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, filter, page, revision, reload]);
  const change = (k: string, v: string) => {
    setFilter({ ...filter, [k]: v });
    setPage(1);
  };
  let rows = result.rows;
  return (
    <section className="panel records-panel">
      <div className="list-toolbar">
        <div>
          <h2>
            {section === "activity"
              ? "All activities"
              : section === "stock_out"
                ? "Issue history"
                : section === "adjustments"
                  ? "Adjustment history"
                  : "Movement history"}
          </h2>
          <p className="muted text-sm">
            {section === "activity"
              ? "Administrative and operational actions"
              : "Permanent records · quantities shown in product units"}
          </p>
        </div>
        <span className="record-count">{result.total} records</span>
      </div>
      {section !== "activity" && (
        <div className="filter-row history-filters">
          <Choice
            label="Product"
            value={filter.product || "all"}
            onChange={(v) => change("product", v)}
            items={[
              { value: "all", label: "All products" },
              ...options(data.products),
            ]}
          />
          <Choice
            label="Warehouse"
            value={filter.warehouse || "all"}
            onChange={(v) => change("warehouse", v)}
            items={[
              { value: "all", label: "All warehouses" },
              ...options(data.warehouses),
            ]}
          />
          {section !== "stock_out" && (
            <Choice
              label="Movement type"
              value={filter.type || "all"}
              onChange={(v) => change("type", v)}
              items={[
                {
                  value: "all",
                  label:
                    section === "adjustments"
                      ? "All adjustments"
                      : "All movements",
                },
                ...(section === "adjustments"
                  ? ["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]
                  : [
                      "RECEIPT",
                      "STOCK_OUT",
                      "TRANSFER_OUT",
                      "TRANSFER_IN",
                      "ADJUSTMENT_IN",
                      "ADJUSTMENT_OUT",
                    ]
                ).map((t) => ({ value: t, label: t.replaceAll("_", " ") })),
              ]}
            />
          )}
          <Field label="From date">
            <input
              type="date"
              aria-label="From date"
              value={filter.from || ""}
              onChange={(e) => change("from", e.target.value)}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              aria-label="To date"
              value={filter.to || ""}
              onChange={(e) => change("to", e.target.value)}
            />
          </Field>
        </div>
      )}
      {error ? (
        <div className="error-banner" role="alert">
          {error}
          <Button variant="outline" onClick={() => setReload((v) => v + 1)}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div className="p-6 space-y-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : section === "activity" ? (
        <DataTable
          rows={rows}
          columns={[
            { label: "Action", render: (r) => <strong>{r.action}</strong> },
            { label: "Details", render: (r) => r.details || "—" },
            { label: "Performed by", render: (r) => r.actor },
            {
              label: "Timestamp",
              render: (r) => (
                <span className="nowrap">{datetime(r.created_at)}</span>
              ),
            },
          ]}
        />
      ) : (
        <DataTable
          rows={rows}
          columns={[
            {
              label: "Product",
              render: (r) => (
                <div className="cell-title">
                  {r.product}
                  <small>{r.sku}</small>
                </div>
              ),
            },
            {
              label: "Type",
              render: (r) => (
                <span className="movement-type">
                  {r.type.replaceAll("_", " ").toLowerCase()}
                </span>
              ),
            },
            {
              label: "Warehouse / location",
              render: (r) => (
                <div className="cell-title">
                  {r.warehouse}
                  <small>{r.location}</small>
                </div>
              ),
            },
            {
              label: "Quantity",
              className: "numeric",
              render: (r) => (
                <strong className={r.quantity > 0 ? "positive" : "negative"}>
                  {r.quantity > 0 ? "+" : ""}
                  {amount(r.quantity)} <small>{r.unit}</small>
                </strong>
              ),
            },
            {
              label: "Reference / reason",
              render: (r) => (
                <div className="cell-title">
                  <span className="code">{r.reference}</span>
                  <small className="reason-text">{r.reason}</small>
                </div>
              ),
            },
            {
              label: "Performed by",
              render: (r) => (
                <div className="cell-title">
                  {r.actor}
                  <small>{datetime(r.created_at)}</small>
                </div>
              ),
            },
          ]}
        />
      )}
      <Pager page={page} total={result.total} size={25} onChange={setPage} />
    </section>
  );
}
function Details({
  detail: d,
  data,
  receive,
  requestAction,
  onEdit,
}: {
  detail: Row;
  data: Row;
  receive: (e: string, id: string) => void;
  requestAction: (a: string, id: string, t: string, m: string) => void;
  onEdit: () => void;
}) {
  const r = d.item;
  const manager = data.user.role !== "Warehouse Staff";
  const admin = data.user.role === "Admin";
  const product = data.products.find((p: Row) => p.id === r.id);
  const warehouse = data.warehouses.find((w: Row) => w.id === r.warehouse_id);
  return (
    <div className="detail-content">
      {["purchase_orders", "transfers"].includes(d.entity) ? (
        <>
          <div className="detail-status">
            <Status value={r.status} />
            <span className="muted">Created {date(r.created_at)}</span>
          </div>
          {d.entity === "purchase_orders" ? (
            <div className="detail-info">
              <span>
                Supplier
                <strong>
                  {
                    data.suppliers.find((s: Row) => s.id === r.supplier_id)
                      ?.name
                  }
                </strong>
              </span>
              <span>
                Receiving warehouse<strong>{warehouse?.name}</strong>
              </span>
            </div>
          ) : (
            <div className="detail-route">
              <Warehouse />
              <div>
                <span>From</span>
                <strong>
                  {data.warehouses.find((w: Row) => w.id === r.source_id)?.name}
                </strong>
              </div>
              <ArrowRight />
              <div>
                <span>To</span>
                <strong>
                  {
                    data.warehouses.find((w: Row) => w.id === r.destination_id)
                      ?.name
                  }
                </strong>
              </div>
            </div>
          )}
          {r.notes && <p className="detail-note">{r.notes}</p>}
          <h3>Order lines</h3>
          {d.lines.map((l: Row) => (
            <div className="detail-line" key={l.id}>
              <strong>{l.product}</strong>
              <span className="muted text-sm">{l.sku}</span>
              {d.entity === "purchase_orders" ? (
                <div className="detail-line-values">
                  <span>
                    Ordered{" "}
                    <b>
                      {amount(l.ordered)} {l.unit}
                    </b>
                  </span>
                  <span>
                    Received <b>{amount(l.received)}</b>
                  </span>
                  <span>
                    Remaining <b>{amount(l.ordered - l.received)}</b>
                  </span>
                </div>
              ) : (
                <div className="detail-line-values">
                  <span>
                    Quantity{" "}
                    <b>
                      {amount(l.quantity)} {l.unit}
                    </b>
                  </span>
                  <span>
                    Source <b>{l.source_location}</b>
                  </span>
                  <span>
                    Destination{" "}
                    <b>{l.destination_location || "Not received"}</b>
                  </span>
                </div>
              )}
            </div>
          ))}
          <div className="detail-actions">
            {d.entity === "purchase_orders" ? (
              r.status === "Draft" && manager ? (
                <Button
                  onClick={() =>
                    requestAction(
                      "approve_po",
                      r.id,
                      "Approve purchase order?",
                      `${r.number} will be available for receiving.`,
                    )
                  }
                >
                  Approve purchase order
                </Button>
              ) : ["Approved", "Partially Received"].includes(r.status) ? (
                <Button onClick={() => receive(d.entity, r.id)}>
                  <ArrowDownToLine size={16} />
                  Receive goods
                </Button>
              ) : r.status === "Received" && manager ? (
                <Button
                  onClick={() =>
                    requestAction(
                      "close_po",
                      r.id,
                      "Close purchase order?",
                      "All order quantities have been received. The order becomes read-only.",
                    )
                  }
                >
                  Close purchase order
                </Button>
              ) : null
            ) : r.status === "Draft" && manager ? (
              <Button
                onClick={() =>
                  requestAction(
                    "dispatch_transfer",
                    r.id,
                    "Dispatch transfer?",
                    "Source stock will decrease and move to in transit.",
                  )
                }
              >
                Dispatch transfer
              </Button>
            ) : r.status === "In Transit" ? (
              <Button onClick={() => receive(d.entity, r.id)}>
                Receive transfer
              </Button>
            ) : null}
          </div>
          {d.receipts?.length > 0 && (
            <>
              <h3>Receipts</h3>
              {d.receipts.map((receipt: Row, i: number) => (
                <div className="receipt-event" key={i}>
                  <ArrowDownToLine size={18} />
                  <div>
                    <strong>
                      {amount(receipt.quantity)} · {receipt.product}
                    </strong>
                    <span>
                      {receipt.location} · {receipt.actor} ·{" "}
                      {datetime(receipt.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div className="detail-status">
            {"active" in r && (
              <Status value={r.active ? "Active" : "Inactive"} />
            )}
            <span className="code">{r.sku || r.code || ""}</span>
            {(d.entity === "warehouses" ? admin : manager) && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit details
              </Button>
            )}
          </div>
          {d.entity === "products" && product && (
            <>
              <div className="detail-metrics">
                <div>
                  <span>Available</span>
                  <strong>
                    {amount(product.available)} <small>{r.unit}</small>
                  </strong>
                </div>
                <div>
                  <span>In transit</span>
                  <strong>{amount(product.transit)}</strong>
                </div>
              </div>
              <div className="detail-info">
                <span>
                  Category<strong>{product.category}</strong>
                </span>
                <span>
                  Reorder level<strong>{amount(r.reorder_level)}</strong>
                </span>
                <span>
                  Barcode<strong>{r.barcode || "Not set"}</strong>
                </span>
              </div>
              <h3>Storage locations</h3>
              <DataTable
                rows={data.inventory.filter((i: Row) => i.product_id === r.id)}
                keyField="location_id"
                columns={[
                  { label: "Warehouse", render: (i) => i.warehouse },
                  { label: "Location", render: (i) => i.location },
                  { label: "Quantity", render: (i) => amount(i.quantity) },
                ]}
              />
            </>
          )}
          {d.entity === "warehouses" && (
            <>
              <p>{r.description}</p>
              <div className="detail-metrics">
                <div>
                  <span>Available units</span>
                  <strong>
                    {amount(
                      data.distribution.find((w: Row) => w.id === r.id)
                        ?.quantity || 0,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Storage locations</span>
                  <strong>
                    {
                      data.locations.filter((l: Row) => l.warehouse_id === r.id)
                        .length
                    }
                  </strong>
                </div>
              </div>
              <h3>Storage locations</h3>
              <DataTable
                rows={data.locations.filter(
                  (l: Row) => l.warehouse_id === r.id,
                )}
                columns={[
                  { label: "Code", render: (l) => l.code },
                  { label: "Description", render: (l) => l.description || "—" },
                  {
                    label: "Status",
                    render: (l) => (
                      <Status value={l.active ? "Active" : "Inactive"} />
                    ),
                  },
                ]}
              />
            </>
          )}
          {d.entity === "locations" && (
            <>
              <p>{r.description}</p>
              <h3>{warehouse?.name}</h3>
              <DataTable
                rows={data.inventory.filter((i: Row) => i.location_id === r.id)}
                keyField="product_id"
                columns={[
                  {
                    label: "Product",
                    render: (i) =>
                      data.products.find((p: Row) => p.id === i.product_id)
                        ?.name,
                  },
                  { label: "Quantity", render: (i) => amount(i.quantity) },
                ]}
              />
            </>
          )}
          {d.entity === "suppliers" && (
            <>
              <div className="detail-info">
                <span>
                  Contact<strong>{r.contact || "—"}</strong>
                </span>
                <span>
                  Email<strong>{r.email || "—"}</strong>
                </span>
                <span>
                  Phone<strong>{r.phone || "—"}</strong>
                </span>
              </div>
              <h3>Purchase orders</h3>
              <DataTable
                rows={data.orders.filter((p: Row) => p.supplier_id === r.id)}
                columns={[
                  { label: "Order", render: (p) => p.number },
                  {
                    label: "Status",
                    render: (p) => <Status value={p.status} />,
                  },
                  { label: "Created", render: (p) => date(p.created_at) },
                ]}
              />
            </>
          )}
        </>
      )}
      <h3 className="activity-heading">Activity history</h3>
      {d.events?.length ? (
        <div className="timeline">
          {d.events.map((e: Row) => (
            <div key={e.id}>
              <i />
              <strong>{e.action}</strong>
              <p>{e.details}</p>
              <span>
                {e.actor} · {datetime(e.created_at)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No activities recorded.</p>
      )}
    </div>
  );
}
