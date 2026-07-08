import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { randomUUID } from "node:crypto";

export interface Asset {
  id: string;
  userId: string;
  name: string;
  type: string;
  url: string;
  thumbnailUrl?: string;
  groupId?: string;
  sortOrder: number;
  createdAt: string;
}

export interface AssetGroup {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

@Injectable()
export class AssetsService {
  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  // ---- Group Methods ----

  async getGroups(userId: string): Promise<AssetGroup[]> {
    try {
      return this.db.query(`
        SELECT * FROM asset_groups 
        WHERE userId = $userId 
        ORDER BY createdAt ASC
      `).all({ $userId: userId }) as AssetGroup[];
    } catch (err) {
      console.error("Failed to get asset groups:", err);
      return [];
    }
  }

  async createGroup(userId: string, name: string): Promise<AssetGroup> {
    const group: AssetGroup = {
      id: randomUUID(),
      userId,
      name,
      createdAt: new Date().toISOString(),
    };

    this.db.query(`
      INSERT INTO asset_groups (id, userId, name, createdAt)
      VALUES ($id, $userId, $name, $createdAt)
    `).run({
      $id: group.id,
      $userId: group.userId,
      $name: group.name,
      $createdAt: group.createdAt,
    });

    return group;
  }

  async renameGroup(userId: string, id: string, name: string): Promise<boolean> {
    try {
      const result = this.db.query(`
        UPDATE asset_groups 
        SET name = $name 
        WHERE id = $id AND userId = $userId
      `).run({
        $name: name,
        $id: id,
        $userId: userId,
      });
      return result.changes > 0;
    } catch (err) {
      console.error("Failed to rename group:", err);
      return false;
    }
  }

  async deleteGroup(userId: string, id: string): Promise<boolean> {
    try {
      // 1. Delete group
      const result = this.db.query(`
        DELETE FROM asset_groups 
        WHERE id = $id AND userId = $userId
      `).run({
        $id: id,
        $userId: userId,
      });

      if (result.changes > 0) {
        // 2. Set groupId to NULL for all assets in this group
        this.db.query(`
          UPDATE assets 
          SET groupId = NULL 
          WHERE groupId = $groupId AND userId = $userId
        `).run({
          $groupId: id,
          $userId: userId,
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to delete group:", err);
      return false;
    }
  }

  // ---- Asset Methods ----

  async getAssets(userId: string, groupId?: string, type?: string): Promise<Asset[]> {
    try {
      let sql = `SELECT * FROM assets WHERE userId = $userId`;
      const params: any = { $userId: userId };

      if (groupId === "null" || groupId === "" || groupId === undefined) {
        // "Un-grouped" assets (where groupId is null or empty)
        sql += ` AND (groupId IS NULL OR groupId = '')`;
      } else if (groupId !== "all") {
        sql += ` AND groupId = $groupId`;
        params.$groupId = groupId;
      }

      if (type && type !== "all") {
        sql += ` AND type = $type`;
        params.$type = type;
      }

      sql += ` ORDER BY sortOrder ASC, createdAt DESC`;

      return this.db.query(sql).all(params) as Asset[];
    } catch (err) {
      console.error("Failed to get assets:", err);
      return [];
    }
  }

  async addAsset(
    userId: string,
    data: {
      name: string;
      type: string;
      url: string;
      thumbnailUrl?: string;
      groupId?: string;
    },
  ): Promise<Asset> {
    // Determine the next sortOrder for this user/group
    const maxSortResult = this.db.query(`
      SELECT MAX(sortOrder) as maxSort FROM assets 
      WHERE userId = $userId
    `).get({ $userId: userId }) as { maxSort: number | null };

    const nextSortOrder = (maxSortResult?.maxSort ?? -1) + 1;

    const asset: Asset = {
      id: randomUUID(),
      userId,
      name: data.name,
      type: data.type,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl,
      groupId: data.groupId || undefined,
      sortOrder: nextSortOrder,
      createdAt: new Date().toISOString(),
    };

    this.db.query(`
      INSERT INTO assets (id, userId, name, type, url, thumbnailUrl, groupId, sortOrder, createdAt)
      VALUES ($id, $userId, $name, $type, $url, $thumbnailUrl, $groupId, $sortOrder, $createdAt)
    `).run({
      $id: asset.id,
      $userId: asset.userId,
      $name: asset.name,
      $type: asset.type,
      $url: asset.url,
      $thumbnailUrl: asset.thumbnailUrl || null,
      $groupId: asset.groupId || null,
      $sortOrder: asset.sortOrder,
      $createdAt: asset.createdAt,
    });

    return asset;
  }

  async updateAssetGroup(userId: string, assetId: string, groupId: string | null): Promise<boolean> {
    try {
      const result = this.db.query(`
        UPDATE assets 
        SET groupId = $groupId 
        WHERE id = $id AND userId = $userId
      `).run({
        $groupId: groupId || null,
        $id: assetId,
        $userId: userId,
      });
      return result.changes > 0;
    } catch (err) {
      console.error("Failed to move asset to group:", err);
      return false;
    }
  }

  async deleteAsset(userId: string, assetId: string): Promise<boolean> {
    try {
      const result = this.db.query(`
        DELETE FROM assets 
        WHERE id = $id AND userId = $userId
      `).run({
        $id: assetId,
        $userId: userId,
      });
      return result.changes > 0;
    } catch (err) {
      console.error("Failed to delete asset:", err);
      return false;
    }
  }

  async reorderAssets(userId: string, assetIds: string[]): Promise<boolean> {
    try {
      // Use transaction to ensure fast batch updates
      const transaction = this.db.transaction((ids: string[]) => {
        const updateStmt = this.db.prepare(`
          UPDATE assets 
          SET sortOrder = $sortOrder 
          WHERE id = $id AND userId = $userId
        `);
        for (let i = 0; i < ids.length; i++) {
          updateStmt.run({
            $sortOrder: i,
            $id: ids[i],
            $userId: userId,
          } as any);
        }
      });

      transaction(assetIds);
      return true;
    } catch (err) {
      console.error("Failed to reorder assets:", err);
      return false;
    }
  }
}
