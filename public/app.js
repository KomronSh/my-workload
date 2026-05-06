const api = {
  login: "/api/login",
  logout: "/api/logout",
  profile: "/api/profile",
  departments: "/api/departments",
  tasks: "/api/tasks",
  stats: "/api/stats",
  analytics: "/api/analytics",
  activity: "/api/activity",
  redistribute: "/api/redistribute",
  autoRedistribute: "/api/auto-redistribute",
  createTask: "/api/task",
  createDepartment: "/api/department",
};

// Проверка авторизации
function checkAuth() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

// Проверяем авторизацию перед загрузкой страницы
if (!checkAuth()) {
  throw new Error("Не авторизован");
}

const elements = {
  departments: document.getElementById("departments"),
  tasks: document.getElementById("tasks"),
  stats: document.getElementById("stats"),
  activity: document.getElementById("activity"),
  analytics: document.getElementById("analytics"),
  taskSelect: document.getElementById("task-select"),
  sourceSelect: document.getElementById("source-select"),
  targetSelect: document.getElementById("target-select"),
  form: document.getElementById("redistribute-form"),
  message: document.getElementById("redistribution-message"),
  managementMessage: document.getElementById("management-message"),
  autoRedistribute: document.getElementById("auto-redistribute"),
  createTaskForm: document.getElementById("create-task-form"),
  taskTitle: document.getElementById("task-title"),
  taskHours: document.getElementById("task-hours"),
  taskDepartment: document.getElementById("task-department"),
  createDepartmentForm: document.getElementById("create-department-form"),
  departmentName: document.getElementById("department-name"),
  departmentCapacity: document.getElementById("department-capacity"),
  authStatus: document.getElementById("auth-status"),
  logoutButton: document.getElementById("logout-button"),
  managementPanel: document.getElementById("management-panel"),
  redistributionPanel: document.getElementById("redistribution-panel"),
  analyticsPanel: document.getElementById("analytics-panel"),
};

const auth = {
  token: localStorage.getItem("authToken") || "",
  user: null,
};

function authHeaders(headers = {}) {
  if (!auth.token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${auth.token}`,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: authHeaders({
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    }),
  });

  const payload = await response.json();
  if (response.status === 401) {
    clearAuthToken();
    updateAuthUI();
  }

  return payload;
}

function createTable(columns, rows) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] !== undefined ? row[col] : "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderDepartments(items) {
  const rows = items.map((item) => ({
    Название: item.name,
    Вместимость: item.capacity,
    "Загружено, ч": item.assignedHours,
    "Утилизация (%)": item.utilization,
  }));

  elements.departments.innerHTML = "";
  elements.departments.appendChild(
    createTable(
      ["Название", "Вместимость", "Загружено, ч", "Утилизация (%)"],
      rows,
    ),
  );
}

function renderTasks(items, departments) {
  const deptMap = new Map(departments.map((dept) => [dept.id, dept.name]));
  const rows = items.map((item) => ({
    Задача: item.title,
    Подразделение: deptMap.get(item.departmentId) || "—",
    Часы: item.hours,
    Статус: item.status,
  }));

  elements.tasks.innerHTML = "";
  elements.tasks.appendChild(
    createTable(["Задача", "Подразделение", "Часы", "Статус"], rows),
  );
}

function renderStats(stats) {
  elements.stats.innerHTML = `
    <ul>
      <li>Всего задач: ${stats.totalTasks}</li>
      <li>Всего подразделений: ${stats.totalDepartments}</li>
      <li>Общая загрузка: ${stats.totalLoad} ч</li>
      <li>Общая вместимость: ${stats.totalCapacity} ч</li>
      <li>Общая утилизация: ${stats.overallUtilization}%</li>
      <li>Записей журнала: ${stats.logCount}</li>
      <li>Просмотров страниц: ${stats.pageViews}</li>
      <li>API-запросов: ${stats.apiRequests}</li>
      <li>Ошибок запросов: ${stats.errors}</li>
    </ul>
  `;
}

function renderAnalytics(analytics) {
  if (!elements.analytics) {
    return;
  }

  const rows = analytics.routes.map((item) => ({
    Маршрут: item.route,
    Запросы: item.count,
    Ошибки: item.errors,
    "Среднее время, мс": item.averageResponseTimeMs,
  }));

  elements.analytics.innerHTML = `
    <ul>
      <li>Сбор статистики с: ${new Date(analytics.startedAt).toLocaleString("ru-RU")}</li>
      <li>Всего запросов: ${analytics.totalRequests}</li>
      <li>Последний запрос: ${
        analytics.lastRequestAt
          ? new Date(analytics.lastRequestAt).toLocaleString("ru-RU")
          : "нет данных"
      }</li>
    </ul>
  `;

  if (rows.length) {
    elements.analytics.appendChild(
      createTable(
        ["Маршрут", "Запросы", "Ошибки", "Среднее время, мс"],
        rows,
      ),
    );
  }
}

function renderActivity(items) {
  elements.activity.innerHTML = "";
  if (!items.length) {
    elements.activity.textContent = "Журнал пуст.";
    return;
  }

  const rows = items.map((item) => ({
    Время: new Date(item.timestamp).toLocaleString("ru-RU"),
    Действие: `${item.action} задачи ${item.taskId}`,
    Откуда: item.from,
    Куда: item.to,
    Часы: item.hours,
  }));

  elements.activity.appendChild(
    createTable(["Время", "Действие", "Откуда", "Куда", "Часы"], rows),
  );
}

function fillSelects(tasks, departments) {
  elements.taskSelect.innerHTML = "";
  elements.sourceSelect.innerHTML = "";
  elements.targetSelect.innerHTML = "";
  elements.taskDepartment.innerHTML = "";

  tasks.forEach((task) => {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = task.title;
    elements.taskSelect.appendChild(option);
  });

  departments.forEach((dept) => {
    const sourceOption = document.createElement("option");
    sourceOption.value = dept.id;
    sourceOption.textContent = dept.name;
    elements.sourceSelect.appendChild(sourceOption);

    const targetOption = document.createElement("option");
    targetOption.value = dept.id;
    targetOption.textContent = dept.name;
    elements.targetSelect.appendChild(targetOption);

    const departmentOption = document.createElement("option");
    departmentOption.value = dept.id;
    departmentOption.textContent = dept.name;
    elements.taskDepartment.appendChild(departmentOption);
  });
}

function setAuthToken(token) {
  auth.token = token;
  localStorage.setItem("authToken", token);
}

function clearAuthToken() {
  auth.token = "";
  auth.user = null;
  localStorage.removeItem("authToken");
}

function updateAuthUI() {
  const loggedIn = Boolean(auth.user);
  const isAdmin = auth.user && auth.user.role === "admin";
  elements.authStatus.textContent = loggedIn
    ? `Вход выполнен: ${auth.user.name}`
    : "Необходимо войти для управления";
  elements.logoutButton.classList.toggle("hidden", !loggedIn);
  elements.managementPanel.classList.toggle("hidden", !isAdmin);
  elements.redistributionPanel.classList.toggle("hidden", !isAdmin);
  elements.analyticsPanel.classList.toggle("hidden", !isAdmin);
}

function showMessage(text, type = "info", target = elements.message) {
  if (!target) {
    return;
  }

  target.textContent = text;
  target.className = `message ${type}`;
}

async function refreshData() {
  const [departments, tasks, stats] = await Promise.all([
    fetchJson(api.departments),
    fetchJson(api.tasks),
    fetchJson(api.stats),
  ]);

  renderDepartments(departments);
  renderTasks(tasks, departments);
  renderStats(stats);
  fillSelects(tasks, departments);

  if (auth.token) {
    const activity = await fetchJson(api.activity);
    renderActivity(activity);
  } else {
    elements.activity.innerHTML =
      "Войдите, чтобы просмотреть журнал активности.";
  }

  if (auth.user && auth.user.role === "admin") {
    const analytics = await fetchJson(api.analytics);
    renderAnalytics(analytics);
  }
}

async function handleCreateTask(event) {
  event.preventDefault();
  const payload = {
    title: elements.taskTitle.value.trim(),
    hours: Number(elements.taskHours.value),
    departmentId: Number(elements.taskDepartment.value),
  };

  const response = await fetchJson(api.createTask, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response && response.id) {
    showMessage("Задача создана.", "success", elements.managementMessage);
    elements.taskTitle.value = "";
    elements.taskHours.value = "";
    await refreshData();
  } else {
    showMessage(
      response.error || "Не удалось создать задачу.",
      "error",
      elements.managementMessage,
    );
  }
}

async function handleCreateDepartment(event) {
  event.preventDefault();
  const payload = {
    name: elements.departmentName.value.trim(),
    capacity: Number(elements.departmentCapacity.value),
  };

  const response = await fetchJson(api.createDepartment, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response && response.id) {
    showMessage(
      "Подразделение создано.",
      "success",
      elements.managementMessage,
    );
    elements.departmentName.value = "";
    elements.departmentCapacity.value = "";
    await refreshData();
  } else {
    showMessage(
      response.error || "Не удалось создать подразделение.",
      "error",
      elements.managementMessage,
    );
  }
}

async function handleAutoRedistribute() {
  const response = await fetchJson(api.autoRedistribute, {
    method: "POST",
  });

  if (response && response.message) {
    showMessage(response.message, "success", elements.managementMessage);
    await refreshData();
  } else {
    showMessage(
      response.error || "Ошибка автоперераспределения.",
      "error",
      elements.managementMessage,
    );
  }
}

async function handleRedistribute(event) {
  event.preventDefault();
  const payload = {
    taskId: Number(elements.taskSelect.value),
    sourceDepartmentId: Number(elements.sourceSelect.value),
    targetDepartmentId: Number(elements.targetSelect.value),
  };

  if (payload.sourceDepartmentId === payload.targetDepartmentId) {
    showMessage(
      "Целевое подразделение должно отличаться от исходного.",
      "error",
    );
    return;
  }

  const response = await fetchJson(api.redistribute, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response && response.success) {
    showMessage(response.message, "success");
    await refreshData();
  } else {
    showMessage(response.error || "Ошибка перераспределения.", "error");
  }
}


async function logout() {
  if (auth.token) {
    await fetchJson(api.logout, { method: "POST" });
  }

  clearAuthToken();
  window.location.href = "/login.html";
}

async function restoreSession() {
  if (!auth.token) {
    updateAuthUI();
    return;
  }

  const response = await fetchJson(api.profile);
  if (response && response.email) {
    auth.user = response;
  } else {
    clearAuthToken();
  }
  updateAuthUI();
}

elements.form.addEventListener("submit", handleRedistribute);
elements.createTaskForm.addEventListener("submit", handleCreateTask);
elements.createDepartmentForm.addEventListener(
  "submit",
  handleCreateDepartment,
);
elements.autoRedistribute.addEventListener("click", handleAutoRedistribute);
elements.logoutButton.addEventListener("click", logout);

restoreSession()
  .then(() => refreshData())
  .catch((error) => {
    console.error(error);
    showMessage("Не удалось загрузить данные. Проверьте сервер.", "error");
  });
