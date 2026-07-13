import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DatabaseService } from "../database/database.service";
import { WorkspacesService } from "./workspaces.service";

describe("WorkspacesService canvas persistence", () => {
  let dbService: DatabaseService;
  let service: WorkspacesService;
  const userId = "workspace-owner";

  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    dbService.db.query(`
      INSERT INTO users (id, username, nickname, passwordHash, role, createdAt, updatedAt)
      VALUES (?, ?, 'Workspace Owner', 'hash', 'user', ?, ?)
    `).run(
      userId,
      `${crypto.randomUUID()}@test.local`,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    service = new WorkspacesService(dbService);
  });

  afterEach(() => {
    dbService.db.close();
    delete process.env.DATABASE_PATH;
  });

  it("keeps the previous canvas revision before a full replacement", async () => {
    const workspace = await service.create("Recovery Test", userId);
    const populatedCanvas = [{ tag: "Text", text: "keep me" }];

    await service.updateCanvas(workspace.id, populatedCanvas, userId);
    await service.updateCanvas(workspace.id, [], userId);

    expect(await service.getCanvas(workspace.id, userId)).toEqual([]);
    const revisions = dbService.db.query(`
      SELECT canvasData FROM workspace_canvas_revisions
      WHERE workspaceId = ? ORDER BY id DESC
    `).all(workspace.id) as Array<{ canvasData: string }>;
    expect(JSON.parse(revisions[0]!.canvasData)).toEqual(populatedCanvas);
  });

  it("does not allow another user to read or overwrite a workspace", async () => {
    const workspace = await service.create("Private", userId);
    await expect(service.getCanvas(workspace.id, "different-user")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.updateCanvas(workspace.id, [{ tag: "Text" }], "different-user"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
