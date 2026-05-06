const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  );
  next();
});

const dataDir = path.join(__dirname, "data");
const dataFilePath = process.env.DATA_PATH || path.join(dataDir, "data.json");

function sha1Hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .createHash("sha256")
    .update(`${salt}:${String(password)}`)
    .digest("hex");
  return { salt, hash };
}

function verifyPassword(user, password) {
  if (user.passwordSalt) {
    return createPasswordHash(password, user.passwordSalt).hash === user.passwordHash;
  }

  return user.passwordHash === sha1Hash(password);
}

const defaultData = {
  users: [
    {
      id: 1,
      name: "Администратор",
      email: "admin@example.com",
      role: "admin",
      passwordHash: sha1Hash("secret"),
    },
  ],
  departments: [
    { id: 1, name: "Производство", capacity: 120 },
    { id: 2, name: "Логистика", capacity: 100 },
    { id: 3, name: "Маркетинг", capacity: 90 },
    { id: 4, name: "ИТ-поддержка", capacity: 80 },
  ],
  tasks: [
    {
      id: 1,
      title: "Анализ текущей загрузки",
      departmentId: 1,
      hours: 18,
      status: "active",
    },
    {
      id: 2,
      title: "Оптимизация маршрутов поставок",
      departmentId: 2,
      hours: 22,
      status: "active",
    },
    {
      id: 3,
      title: "Контент для сайта",
      departmentId: 3,
      hours: 12,
      status: "active",
    },
    {
      id: 4,
      title: "Настройка CRM",
      departmentId: 4,
      hours: 20,
      status: "active",
    },
    {
      id: 5,
      title: "Проверка безопасности",
      departmentId: 4,
      hours: 14,
      status: "active",
    },
    {
      id: 6,
      title: "SEO-анализ",
      departmentId: 3,
      hours: 18,
      status: "active",
    },
  ],
  activityLog: [],
  requestStats: {
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    apiRequests: 0,
    pageViews: 0,
    errors: 0,
    routes: {},
  },
};

function ensureDataStore() {
  const directory = path.dirname(dataFilePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(
      dataFilePath,
      JSON.stringify(defaultData, null, 2),
      "utf8",
    );
  }
}

function loadData() {
  ensureDataStore();

  try {
    const raw = fs.readFileSync(dataFilePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      users: parsed.users || defaultData.users,
      departments: parsed.departments || defaultData.departments,
      tasks: parsed.tasks || defaultData.tasks,
      activityLog: parsed.activityLog || [],
      requestStats: {
        ...defaultData.requestStats,
        ...(parsed.requestStats || {}),
        routes: {
          ...defaultData.requestStats.routes,
          ...((parsed.requestStats && parsed.requestStats.routes) || {}),
        },
      },
    };
  } catch (error) {
    fs.writeFileSync(
      dataFilePath,
      JSON.stringify(defaultData, null, 2),
      "utf8",
    );
    return { ...defaultData };
  }
}

function saveData(data) {
  ensureDataStore();
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf8");
}

const data = loadData();
const { users, departments, tasks, activityLog, requestStats } = data;
const sessions = new Map();

const getNextId = (items) =>
  items.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1;

const findDepartment = (id) => departments.find((dept) => dept.id === id);
const findUserByEmail = (email) => users.find((user) => user.email === email);

function persistCurrentData() {
  saveData({ users, departments, tasks, activityLog, requestStats });
}

function recordRequest(req, res, responseTimeMs) {
  const isApi = req.path.startsWith("/api/");
  const isPage =
    req.method === "GET" &&
    (req.path === "/" || req.path.endsWith(".html") || !path.extname(req.path));

  if (!isApi && !isPage) {
    return;
  }

  const routeKey = `${req.method} ${req.route ? req.route.path : req.path}`;
  requestStats.totalRequests += 1;
  requestStats.apiRequests += isApi ? 1 : 0;
  requestStats.pageViews += isPage ? 1 : 0;
  requestStats.errors += res.statusCode >= 400 ? 1 : 0;
  requestStats.lastRequestAt = new Date().toISOString();
  requestStats.routes[routeKey] = requestStats.routes[routeKey] || {
    count: 0,
    errors: 0,
    totalResponseTimeMs: 0,
  };
  requestStats.routes[routeKey].count += 1;
  requestStats.routes[routeKey].errors += res.statusCode >= 400 ? 1 : 0;
  requestStats.routes[routeKey].totalResponseTimeMs += responseTimeMs;

  persistCurrentData();
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => recordRequest(req, res, Date.now() - startedAt));
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const calculateLoad = () => {
  return departments.map((dept) => {
    const tasksForDept = tasks.filter((task) => task.departmentId === dept.id);
    const load = tasksForDept.reduce((sum, task) => sum + task.hours, 0);

    return {
      ...dept,
      assignedHours: load,
      utilization: Math.round((load / dept.capacity) * 100),
    };
  });
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = users.find((u) => u.id === session.userId);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPassword = String(password || "");
  const normalizedName = String(name || "").trim();

  if (!normalizedEmail || !normalizedPassword || !normalizedName) {
    return res.status(400).json({ error: "Имя, email и пароль обязательны." });
  }

  if (normalizedPassword.length < 4) {
    return res
      .status(400)
      .json({ error: "Пароль должен быть не менее 4 символов." });
  }

  const existingUser = findUserByEmail(normalizedEmail);
  if (existingUser) {
    return res.status(400).json({ error: "Этот email уже зарегистрирован." });
  }

  const passwordData = createPasswordHash(normalizedPassword);
  const newUser = {
    id: getNextId(users),
    name: normalizedName,
    email: normalizedEmail,
    role: "user",
    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,
  };

  users.push(newUser);
  persistCurrentData();

  const token = crypto.randomBytes(16).toString("hex");
  sessions.set(token, {
    userId: newUser.id,
    createdAt: new Date().toISOString(),
  });

  res.json({
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    },
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: "Email и пароль обязательны." });
  }

  const user = findUserByEmail(normalizedEmail);
  if (!user || !verifyPassword(user, normalizedPassword)) {
    return res.status(401).json({ error: "Неверные учетные данные." });
  }

  const token = crypto.randomBytes(16).toString("hex");
  sessions.set(token, { userId: user.id, createdAt: new Date().toISOString() });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  sessions.delete(token);
  res.json({ success: true });
});

app.get("/api/profile", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  });
});

app.get("/api/departments", (req, res) => {
  res.json(calculateLoad());
});

app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

app.get("/api/stats", (req, res) => {
  const loads = calculateLoad();
  const totalLoad = loads.reduce((sum, dept) => sum + dept.assignedHours, 0);
  const totalCapacity = loads.reduce((sum, dept) => sum + dept.capacity, 0);

  res.json({
    totalTasks: tasks.length,
    totalDepartments: departments.length,
    totalLoad,
    totalCapacity,
    overallUtilization: Math.round((totalLoad / totalCapacity) * 100),
    logCount: activityLog.length,
    totalRequests: requestStats.totalRequests,
    apiRequests: requestStats.apiRequests,
    pageViews: requestStats.pageViews,
    errors: requestStats.errors,
  });
});

app.get("/api/analytics", requireAuth, requireAdmin, (req, res) => {
  const routes = Object.entries(requestStats.routes).map(([route, item]) => ({
    route,
    count: item.count,
    errors: item.errors,
    averageResponseTimeMs: item.count
      ? Math.round(item.totalResponseTimeMs / item.count)
      : 0,
  }));

  res.json({
    startedAt: requestStats.startedAt,
    lastRequestAt: requestStats.lastRequestAt || null,
    totalRequests: requestStats.totalRequests,
    apiRequests: requestStats.apiRequests,
    pageViews: requestStats.pageViews,
    errors: requestStats.errors,
    routes: routes.sort((a, b) => b.count - a.count).slice(0, 10),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    dataFile: path.basename(dataFilePath),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/security-audit", requireAuth, requireAdmin, (req, res) => {
  res.json({
    checkedAt: new Date().toISOString(),
    controls: [
      "Авторизация Bearer-токеном для управленческих операций",
      "Разделение ролей пользователя и администратора",
      "Валидация входных данных на API",
      "HTTP-заголовки защиты: CSP, X-Frame-Options, X-Content-Type-Options",
      "Хеширование новых паролей SHA-256 с солью",
      "Журналирование действий и статистика запросов",
    ],
  });
});

app.get("/api/backup", requireAuth, requireAdmin, (req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    users: users.map(({ passwordHash, passwordSalt, ...user }) => user),
    departments,
    tasks,
    activityLog,
    requestStats,
  });
});

app.post("/api/task", requireAuth, requireAdmin, (req, res) => {
  const { title, departmentId, hours } = req.body;
  const normalizedTitle = String(title || "").trim();
  const department = findDepartment(Number(departmentId));
  const parsedHours = Number(hours);

  if (
    !normalizedTitle ||
    !department ||
    !Number.isFinite(parsedHours) ||
    parsedHours <= 0
  ) {
    return res.status(400).json({ error: "Неверные данные задачи." });
  }

  const task = {
    id: getNextId(tasks),
    title: normalizedTitle,
    departmentId: department.id,
    hours: parsedHours,
    status: "active",
  };

  tasks.push(task);
  activityLog.push({
    timestamp: new Date().toISOString(),
    action: "create-task",
    taskId: task.id,
    from: department.name,
    to: department.name,
    hours: task.hours,
  });

  persistCurrentData();
  res.status(201).json(task);
});

app.post("/api/department", requireAuth, requireAdmin, (req, res) => {
  const { name, capacity } = req.body;
  const normalizedName = String(name || "").trim();
  const parsedCapacity = Number(capacity);

  if (
    !normalizedName ||
    !Number.isFinite(parsedCapacity) ||
    parsedCapacity <= 0
  ) {
    return res.status(400).json({ error: "Неверные данные подразделения." });
  }

  if (departments.some((dept) => dept.name === normalizedName)) {
    return res
      .status(400)
      .json({ error: "Подразделение с таким именем уже существует." });
  }

  const department = {
    id: getNextId(departments),
    name: normalizedName,
    capacity: parsedCapacity,
  };

  departments.push(department);
  activityLog.push({
    timestamp: new Date().toISOString(),
    action: "create-department",
    from: department.name,
    to: department.name,
    hours: 0,
  });

  persistCurrentData();
  res.status(201).json(department);
});

app.post("/api/redistribute", requireAuth, requireAdmin, (req, res) => {
  const { sourceDepartmentId, targetDepartmentId, taskId } = req.body;
  const task = tasks.find((item) => item.id === taskId);
  const source = findDepartment(Number(sourceDepartmentId));
  const target = findDepartment(Number(targetDepartmentId));

  if (!task || !source || !target) {
    return res
      .status(400)
      .json({ error: "Invalid department or task selection." });
  }

  if (task.departmentId !== source.id) {
    return res.status(400).json({
      error: "Задача не принадлежит указанному исходному подразделению.",
    });
  }

  task.departmentId = target.id;
  activityLog.push({
    timestamp: new Date().toISOString(),
    action: "redistribute",
    taskId: task.id,
    from: source.name,
    to: target.name,
    hours: task.hours,
  });

  persistCurrentData();
  res.json({ success: true, message: "Задача успешно перераспределена." });
});

app.post("/api/auto-redistribute", requireAuth, requireAdmin, (req, res) => {
  const loads = calculateLoad();
  const overloaded = loads
    .filter((dept) => dept.utilization > 100)
    .sort((a, b) => b.utilization - a.utilization);
  const underloaded = loads
    .filter((dept) => dept.utilization < 90)
    .sort((a, b) => a.utilization - b.utilization);
  const workload = new Map(loads.map((dept) => [dept.id, dept.assignedHours]));

  if (!overloaded.length || !underloaded.length) {
    return res.json({
      message: "Нет задач для перераспределения.",
      operations: [],
    });
  }

  const operations = [];

  overloaded.forEach((source) => {
    const sourceTasks = tasks
      .filter((task) => task.departmentId === source.id)
      .sort((a, b) => b.hours - a.hours);

    for (const task of sourceTasks) {
      const target = underloaded.find(
        (dept) => workload.get(dept.id) + task.hours <= dept.capacity,
      );
      if (!target) {
        continue;
      }

      const fromName = source.name;
      const toName = target.name;

      task.departmentId = target.id;
      workload.set(source.id, workload.get(source.id) - task.hours);
      workload.set(target.id, workload.get(target.id) + task.hours);

      activityLog.push({
        timestamp: new Date().toISOString(),
        action: "auto-redistribute",
        taskId: task.id,
        from: fromName,
        to: toName,
        hours: task.hours,
      });

      operations.push({
        taskId: task.id,
        from: fromName,
        to: toName,
        hours: task.hours,
      });

      if (workload.get(source.id) <= source.capacity) {
        break;
      }
    }
  });

  persistCurrentData();

  res.json({
    message: operations.length
      ? `Выполнено ${operations.length} операций по перераспределению.`
      : "Нет задач для перераспределения.",
    operations,
  });
});

app.get("/api/activity", requireAuth, (req, res) => {
  res.json(activityLog.slice(-20));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

module.exports = app;
