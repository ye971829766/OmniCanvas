import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DatabaseService } from "../database/database.service";
import { PricingService } from "./pricing.service";

describe("PricingService", () => {
  let dbService: DatabaseService;
  let pricing: PricingService;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ":memory:";
    dbService = new DatabaseService();
    await dbService.onModuleInit();
    pricing = new PricingService(dbService);
  });

  afterEach(() => {
    dbService.db.close();
    delete process.env.DATABASE_PATH;
  });

  it("charges 2K/4K quality as resolution tiers without stacking size", () => {
    expect(pricing.quote("image_generation", { quality: "1K" }).credits).toBe(10);
    expect(pricing.quote("image_generation", { quality: "2K" }).credits).toBe(20);
    expect(pricing.quote("image_generation", { quality: "4K" }).credits).toBe(40);
    expect(pricing.quote("image_generation", { quality: "2K", size: "auto" }).credits).toBe(20);
  });

  it("maps common pixel sizes and unicode separators onto resolution buckets", () => {
    expect(pricing.quote("image_generation", { size: "1024x1024" }).credits).toBe(10);
    expect(pricing.quote("image_generation", { size: "1024×1792" }).credits).toBe(20);
    expect(pricing.quote("image_generation", { size: "2048*1152" }).credits).toBe(20);
    expect(pricing.quote("image_generation", { size: "4096x4096" }).credits).toBe(40);
  });

  it("keeps preset quality multipliers for hd/high and still scales by n", () => {
    expect(pricing.quote("image_generation", { quality: "hd" }).credits).toBe(20);
    expect(pricing.quote("image_generation", { quality: "standard", n: 3 }).credits).toBe(30);
    expect(pricing.quote("image_edit", { quality: "2k" }).credits).toBe(20);
  });

  it("quotes video overage from included seconds and ignores invalid duration", () => {
    expect(pricing.quote("video_generation", { seconds: 5 }).credits).toBe(500);
    expect(pricing.quote("video_generation", { seconds: 8 }).credits).toBe(800);
    expect(pricing.quote("video_generation", { seconds: "not-a-number" }).credits).toBe(500);
  });
});
