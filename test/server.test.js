const fs = require("fs");
const path = require("path");
const request = require("supertest");

const testDataPath = path.join(__dirname, "test-data.json");
process.env.DATA_PATH = testDataPath;
if (fs.existsSync(testDataPath)) {
  fs.unlinkSync(testDataPath);
}

const app = require("../server");

afterAll(() => {
  if (fs.existsSync(testDataPath)) {
    fs.unlinkSync(testDataPath);
  }
});

describe("API Server", () => {
  let authToken = null;

  it("should log in as admin", async () => {
    const response = await request(app)
      .post("/api/login")
      .send({ email: "admin@example.com", password: "secret" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body).toHaveProperty("user");
    authToken = response.body.token;
  });

  it("should return departments", async () => {
    const response = await request(app).get("/api/departments");
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("should expose health status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.headers).toHaveProperty("x-frame-options", "DENY");
  });

  it("should create a new task with authorization", async () => {
    const response = await request(app)
      .post("/api/task")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Новая задача", hours: 10, departmentId: 1 });

    expect(response.statusCode).toBe(201);
    expect(response.body).toHaveProperty("id");
    expect(response.body.title).toBe("Новая задача");
  });

  it("should redistribute a task with authorization", async () => {
    const createResponse = await request(app)
      .post("/api/task")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Перемещаемая задача", hours: 5, departmentId: 1 });

    expect(createResponse.statusCode).toBe(201);
    const task = createResponse.body;

    const response = await request(app)
      .post("/api/redistribute")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ taskId: task.id, sourceDepartmentId: 1, targetDepartmentId: 2 });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("success", true);
  });

  it("should return application analytics for admin", async () => {
    const response = await request(app)
      .get("/api/analytics")
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("totalRequests");
    expect(Array.isArray(response.body.routes)).toBe(true);
  });

  it("should return security audit checklist for admin", async () => {
    const response = await request(app)
      .get("/api/security-audit")
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.controls)).toBe(true);
  });
});
