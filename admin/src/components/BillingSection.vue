<template>
  <div v-loading="loading" class="billing-admin">
    <el-row :gutter="16">
      <el-col v-for="metric in metrics" :key="metric.label" :span="6">
        <el-card shadow="none" class="metric-card">
          <div class="metric-top">
            <span>{{ metric.label }}</span>
            <div
              :style="{ background: metric.bg, color: metric.color }"
              class="metric-icon"
            >
              <el-icon :size="20"><component :is="metric.icon" /></el-icon>
            </div>
          </div>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.help }}</small>
        </el-card>
      </el-col>
    </el-row>

    <el-alert
      v-if="overview && !overview.payment.checkoutConfigured"
      title="支付渠道未配置"
      :description="paymentSetupMessage"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-card shadow="none">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="用户账户" name="accounts">
          <div class="table-toolbar">
            <el-input
              v-model="keyword"
              :prefix-icon="Search"
              clearable
              placeholder="搜索用户名或昵称"
              style="width: 260px"
            />
            <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
          </div>
          <el-table :data="filteredAccounts" style="width: 100%">
            <el-table-column label="用户" min-width="210">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :src="row.avatarUrl" :size="36">{{
                    initials(row)
                  }}</el-avatar>
                  <div>
                    <strong>{{ row.nickname || row.username }}</strong
                    ><span>@{{ row.username }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="可用积分" width="150"
              ><template #default="{ row }"
                ><b>{{ formatCredits(row.availableCredits) }}</b></template
              ></el-table-column
            >
            <el-table-column label="预留" width="120"
              ><template #default="{ row }">{{
                formatCredits(row.reservedCredits)
              }}</template></el-table-column
            >
            <el-table-column label="累计发放" width="140"
              ><template #default="{ row }">{{
                formatCredits(row.lifetimeGrantedCredits)
              }}</template></el-table-column
            >
            <el-table-column label="累计消耗" width="140"
              ><template #default="{ row }">{{
                formatCredits(row.lifetimeSpentCredits)
              }}</template></el-table-column
            >
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }"
                ><el-button
                  type="primary"
                  plain
                  size="small"
                  @click="openAdjust(row)"
                  >调账</el-button
                ></template
              >
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="支付订单" name="orders">
          <div class="table-toolbar">
            <el-select
              v-model="orderStatusFilter"
              clearable
              placeholder="全部状态"
              style="width: 160px"
              @change="loadOrders"
            >
              <el-option label="待支付" value="pending" /><el-option
                label="已支付"
                value="paid"
              /><el-option label="已关闭" value="closed" />
              <el-option label="退款中" value="refunding" /><el-option
                label="已退款"
                value="refunded"
              />
            </el-select>
          </div>
          <el-table :data="orders" style="width: 100%">
            <el-table-column label="订单" min-width="180"
              ><template #default="{ row }"
                ><div class="order-id">
                  <strong>{{ row.product?.name || row.sku }}</strong
                  ><span>#{{ row.id.slice(0, 10) }}</span>
                </div></template
              ></el-table-column
            >
            <el-table-column label="用户" min-width="150"
              ><template #default="{ row }">{{
                row.nickname || row.username
              }}</template></el-table-column
            >
            <el-table-column label="金额" width="120"
              ><template #default="{ row }"
                ><b>¥{{ formatMoney(row.amountMinor) }}</b></template
              ></el-table-column
            >
            <el-table-column label="积分" width="120"
              ><template #default="{ row }">{{
                formatCredits(row.product?.credits || 0)
              }}</template></el-table-column
            >
            <el-table-column label="状态" width="110"
              ><template #default="{ row }"
                ><el-tag :type="statusType(row.status)">{{
                  statusLabel(row.status)
                }}</el-tag></template
              ></el-table-column
            >
            <el-table-column label="渠道" width="140"
              ><template #default="{ row }">{{
                row.provider || "—"
              }}</template></el-table-column
            >
            <el-table-column label="创建时间" width="180"
              ><template #default="{ row }">{{
                formatDate(row.createdAt)
              }}</template></el-table-column
            >
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="计价规则" name="pricing">
          <div class="pricing-head">
            <div>
              <strong>当前版本：{{ pricing.version?.id || "—" }}</strong>
              <span
                >修改后立即对<strong>新预扣</strong>生效。拖动目标毛利率可反推建议积分；前期可压低毛利拉新。</span
              >
            </div>
            <div class="pricing-head-actions">
              <el-tag type="success">{{
                pricing.version?.status || "未配置"
              }}</el-tag>
              <el-button type="primary" @click="openCreateRule"
                >新增规则</el-button
              >
            </div>
          </div>

          <!-- Profit planner -->
          <div class="profit-planner">
            <div class="profit-planner__top">
              <div class="profit-planner__title">
                <h4>利润规划器</h4>
                <p>
                  按上游成本与积分售价实时估算 AI
                  毛利；拖动目标毛利率生成建议价，可一键套用。
                </p>
              </div>
              <div class="profit-planner__presets">
                <el-button
                  size="small"
                  :type="targetMarginPct === 15 ? 'primary' : 'default'"
                  @click="targetMarginPct = 15"
                  >引流 15%</el-button
                >
                <el-button
                  size="small"
                  :type="targetMarginPct === 30 ? 'primary' : 'default'"
                  @click="targetMarginPct = 30"
                  >平衡 30%</el-button
                >
                <el-button
                  size="small"
                  :type="targetMarginPct === 50 ? 'primary' : 'default'"
                  @click="targetMarginPct = 50"
                  >稳健 50%</el-button
                >
                <el-button
                  size="small"
                  :type="targetMarginPct === 70 ? 'primary' : 'default'"
                  @click="targetMarginPct = 70"
                  >高利 70%</el-button
                >
              </div>
            </div>

            <div class="profit-planner__controls">
              <div class="profit-control">
                <label>积分单价参考</label>
                <el-select
                  v-model="creditPackSku"
                  style="width: 100%"
                  @change="onPackChange"
                >
                  <el-option
                    v-for="p in packOptions"
                    :key="p.sku"
                    :label="p.label"
                    :value="p.sku"
                  />
                  <el-option label="自定义单价" value="__custom__" />
                </el-select>
              </div>
              <div class="profit-control" v-if="creditPackSku === '__custom__'">
                <label>自定义 ¥ / 积分</label>
                <el-input-number
                  v-model="customYuanPerCredit"
                  :min="0.001"
                  :step="0.001"
                  :precision="4"
                  controls-position="right"
                  style="width: 100%"
                />
              </div>
              <div class="profit-control profit-control--slider">
                <div class="slider-head">
                  <label>目标毛利率</label>
                  <strong :class="marginToneClass(targetMarginPct)"
                    >{{ targetMarginPct }}%</strong
                  >
                </div>
                <el-slider
                  v-model="targetMarginPct"
                  :min="0"
                  :max="85"
                  :step="1"
                  :marks="marginMarks"
                  show-stops
                />
                <div class="slider-hint">{{ marginStageHint }}</div>
              </div>
            </div>

            <div class="cost-assumptions">
              <div class="cost-assumptions__head">
                <span>上游成本假设（元，仅用于估算，不写进计费）</span>
                <el-button
                  size="small"
                  text
                  type="primary"
                  @click="resetDefaultCosts"
                  >恢复默认</el-button
                >
              </div>
              <el-row :gutter="10">
                <el-col :span="6" v-for="item in costFields" :key="item.key">
                  <div class="cost-field">
                    <label>{{ item.label }}</label>
                    <el-input-number
                      v-model="unitCosts[item.key]"
                      :min="0"
                      :step="item.step"
                      :precision="3"
                      controls-position="right"
                      style="width: 100%"
                      @change="persistCosts"
                    />
                  </div>
                </el-col>
              </el-row>
              <div class="profit-summary">
                当前参考单价 <b>¥{{ yuanPerCredit.toFixed(4) }}/积分</b> ·
                视频成本按 <b>¥{{ unitCosts.video_generation }}/秒</b> · 目标
                {{ targetMarginPct }}% 时视频约需
                <b>{{ suggestedVideoCreditsPerSec }} 积分/秒</b>
                （≈ ¥{{
                  (suggestedVideoCreditsPerSec * yuanPerCredit).toFixed(2)
                }}/秒）
              </div>
            </div>
          </div>

          <el-table
            :data="ruleProfitRows"
            style="width: 100%"
            class="profit-table"
          >
            <el-table-column label="计费项目" min-width="150">
              <template #default="{ row }">
                <strong>{{ operationLabel(row.rule.operation) }}</strong>
                <div class="subtext">
                  {{ row.rule.model || "全部模型" }} · {{ row.scenarioLabel }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="当前扣费" width="120">
              <template #default="{ row }">
                <b>{{ formatCredits(row.currentCredits) }}</b>
                <div class="subtext">积分</div>
              </template>
            </el-table-column>
            <el-table-column label="用户实付" width="100">
              <template #default="{ row }">
                <b>¥{{ row.revenueYuan.toFixed(2) }}</b>
              </template>
            </el-table-column>
            <el-table-column label="上游成本" width="100">
              <template #default="{ row }">
                ¥{{ row.costYuan.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="当前毛利" width="110">
              <template #default="{ row }">
                <el-tag
                  :type="marginTagType(row.currentMarginPct)"
                  effect="light"
                  round
                >
                  {{ formatMargin(row.currentMarginPct) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="目标建议扣费" min-width="140">
              <template #default="{ row }">
                <b class="suggest-credits">{{
                  formatCredits(row.suggestedCredits)
                }}</b>
                <div class="subtext">
                  ¥{{ row.suggestedRevenueYuan.toFixed(2) }} · 目标
                  {{ targetMarginPct }}%
                </div>
              </template>
            </el-table-column>
            <el-table-column label="附加配置" min-width="150">
              <template #default="{ row }"
                ><span class="config-summary">{{
                  configSummary(row.rule)
                }}</span></template
              >
            </el-table-column>
            <el-table-column
              label="操作"
              width="200"
              align="right"
              fixed="right"
            >
              <template #default="{ row }">
                <el-button
                  type="success"
                  plain
                  size="small"
                  :disabled="!row.canApply || row.suggestedCredits <= 0"
                  :loading="applyingRuleId === row.rule.id"
                  @click="applySuggestedPricing(row)"
                  >套用目标价</el-button
                >
                <el-button
                  type="primary"
                  plain
                  size="small"
                  @click="openEditRule(row.rule)"
                  >编辑</el-button
                >
                <el-button
                  v-if="row.rule.model"
                  type="danger"
                  plain
                  size="small"
                  @click="removeRule(row.rule)"
                  >删除</el-button
                >
              </template>
            </el-table-column>
          </el-table>

          <div class="bulk-apply-bar">
            <span
              >将目标毛利率
              <b>{{ targetMarginPct }}%</b>
              一键套用到全部「默认模型」规则（不含模型专用覆盖）</span
            >
            <el-button
              type="primary"
              :loading="bulkApplying"
              @click="applyAllSuggested"
              >批量套用目标价</el-button
            >
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog
      v-model="adjustVisible"
      title="积分调账"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedAccount" class="adjust-user">
        <span>{{ selectedAccount.nickname || selectedAccount.username }}</span>
        <strong
          >当前
          {{ formatCredits(selectedAccount.availableCredits) }} 积分</strong
        >
      </div>
      <el-form label-position="top">
        <el-form-item label="调整积分" required>
          <el-input-number
            v-model="adjustAmount"
            :precision="2"
            :step="10"
            controls-position="right"
            style="width: 100%"
          />
          <div class="form-hint">
            正数为发放，负数为扣减；扣减不能超过可用余额。
          </div>
        </el-form-item>
        <el-form-item label="调账原因" required>
          <el-input
            v-model="adjustReason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请输入可审计的具体原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" @click="submitAdjust"
          >确认调账</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="ruleVisible"
      :title="ruleForm.mode === 'create' ? '新增计价规则' : '编辑计价规则'"
      width="620px"
      :close-on-click-modal="false"
    >
      <div class="rule-profit-box">
        <div class="rule-profit-box__row">
          <span>本规则即时估算</span>
          <el-tag
            :type="marginTagType(formLiveEstimate.marginPct)"
            effect="light"
            round
          >
            毛利 {{ formatMargin(formLiveEstimate.marginPct) }}
          </el-tag>
        </div>
        <div class="rule-profit-box__metrics">
          <div>
            <label>场景</label><b>{{ formLiveEstimate.scenarioLabel }}</b>
          </div>
          <div>
            <label>用户付</label
            ><b>¥{{ formLiveEstimate.revenueYuan.toFixed(2) }}</b>
          </div>
          <div>
            <label>成本</label
            ><b>¥{{ formLiveEstimate.costYuan.toFixed(2) }}</b>
          </div>
          <div>
            <label>目标 {{ targetMarginPct }}%</label
            ><b>{{ formatCredits(formLiveEstimate.suggestedCredits) }} 积分</b>
          </div>
        </div>
        <div class="rule-profit-box__slider">
          <span>用目标毛利率填入积分</span>
          <el-button
            size="small"
            type="primary"
            plain
            @click="fillFormFromTargetMargin"
            >填入建议积分</el-button
          >
        </div>
      </div>
      <el-form label-position="top">
        <el-form-item label="计费项目" required>
          <el-select
            v-model="ruleForm.operation"
            :disabled="ruleForm.mode === 'edit'"
            style="width: 100%"
            placeholder="选择操作类型"
          >
            <el-option
              v-for="op in operationOptions"
              :key="op.value"
              :label="op.label"
              :value="op.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型（留空 = 全部模型）">
          <el-input
            v-model="ruleForm.model"
            :disabled="ruleForm.mode === 'edit' && !ruleForm.modelEditable"
            clearable
            placeholder="例如 gpt-image-1 / kling-v1"
          />
          <div class="form-hint">
            模型专用规则优先级更高；默认「全部模型」规则不可删除，只能改价。
          </div>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="基础积分" required>
              <el-input-number
                v-model="ruleForm.baseCredits"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-input-number
                v-model="ruleForm.priority"
                :min="0"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="输入 / 百万 Token">
              <el-input-number
                v-model="ruleForm.inputCreditsPerMillionTokens"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="输出 / 百万 Token">
              <el-input-number
                v-model="ruleForm.outputCreditsPerMillionTokens"
                :min="0"
                :precision="2"
                :step="1"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="ruleForm.operation === 'video_generation'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="包含秒数（基础积分覆盖）">
                <el-input-number
                  v-model="ruleForm.includedSeconds"
                  :min="0"
                  :step="1"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="超出后积分 / 秒">
                <el-input-number
                  v-model="ruleForm.additionalCreditsPerSecond"
                  :min="0"
                  :precision="2"
                  :step="10"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <div class="form-hint video-hint">
            例：基础 500 积分 + 含 5 秒 + 超出 100 积分/秒 → 5 秒 = 500，6 秒 =
            600，10 秒 = 1000。 按创作包约 ¥0.03/积分，约等于 ¥3/秒（对应上游
            0.7–1.5 元/秒约 50–75% 毛利）。
          </div>
        </template>

        <template
          v-if="
            ruleForm.operation === 'image_generation' ||
            ruleForm.operation === 'image_edit'
          "
        >
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="high 质量倍率">
                <el-input-number
                  v-model="ruleForm.qualityHigh"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="hd 质量倍率">
                <el-input-number
                  v-model="ruleForm.qualityHd"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="2048 尺寸倍率">
                <el-input-number
                  v-model="ruleForm.size2048"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="4096 尺寸倍率">
                <el-input-number
                  v-model="ruleForm.size4096"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="4k 尺寸倍率">
                <el-input-number
                  v-model="ruleForm.size4k"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <template v-if="ruleForm.operation === 'upscale_image'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="2× 倍率">
                <el-input-number
                  v-model="ruleForm.scale2"
                  :min="0.1"
                  :step="0.1"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="4× 倍率">
                <el-input-number
                  v-model="ruleForm.scale4"
                  :min="0.1"
                  :step="0.1"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="ruleVisible = false">取消</el-button>
        <el-button type="primary" :loading="ruleSaving" @click="submitRule"
          >保存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { confirmAdminAction } from "../utils/adminConfirm";
import {
  Coin,
  Money,
  Refresh,
  Search,
  ShoppingCart,
  TrendCharts,
} from "@element-plus/icons-vue";
import {
  adjustUserCredits,
  createBillingPricingRule,
  deleteBillingPricingRule,
  getBillingAccounts,
  getBillingAdminOrders,
  getBillingOverview,
  getBillingPricing,
  getBillingProducts,
  updateBillingPricingRule,
  type BillingAccountAdmin,
  type BillingOrderAdmin,
  type BillingOverview,
  type BillingPricingRule,
  type BillingProductAdmin,
} from "../utils/api";

const COST_STORAGE_KEY = "omnicanvas_admin_unit_costs_v1";
const MARGIN_STORAGE_KEY = "omnicanvas_admin_target_margin_v1";

const DEFAULT_UNIT_COSTS: Record<string, number> = {
  image_generation: 0.06,
  image_edit: 0.06,
  inpaint_image: 0.06,
  video_generation: 1.0, // 元/秒
  remove_background: 0.02,
  upscale_image: 0.03,
  llm_chat: 2.0, // 元 / 百万 tokens（输入+输出粗估）
};

const costFields = [
  { key: "image_generation", label: "图像 / 次", step: 0.01 },
  { key: "video_generation", label: "视频 / 秒", step: 0.1 },
  { key: "remove_background", label: "抠图 / 次", step: 0.01 },
  { key: "upscale_image", label: "放大 / 次", step: 0.01 },
  { key: "inpaint_image", label: "重绘 / 次", step: 0.01 },
  { key: "llm_chat", label: "对话 / 百万Tok", step: 0.1 },
];

const loading = ref(false);
const overview = ref<BillingOverview | null>(null);
const accounts = ref<BillingAccountAdmin[]>([]);
const orders = ref<BillingOrderAdmin[]>([]);
const products = ref<BillingProductAdmin[]>([]);
const pricing = ref<{ version: any; rules: BillingPricingRule[] }>({
  version: null,
  rules: [],
});
const activeTab = ref("accounts");
const keyword = ref("");
const orderStatusFilter = ref("");
const adjustVisible = ref(false);
const selectedAccount = ref<BillingAccountAdmin | null>(null);
const adjustAmount = ref(0);
const adjustReason = ref("");
const adjusting = ref(false);

const ruleVisible = ref(false);
const ruleSaving = ref(false);
const ruleForm = ref(emptyRuleForm());
const applyingRuleId = ref<string | null>(null);
const bulkApplying = ref(false);

const targetMarginPct = ref(loadStoredMargin());
const creditPackSku = ref("credits_2000");
const customYuanPerCredit = ref(0.03);
const unitCosts = ref<Record<string, number>>(loadStoredCosts());

const marginMarks = { 15: "引流", 30: "平衡", 50: "稳健", 70: "高利" };

const operationOptions = [
  { value: "llm_chat", label: "Agent 对话" },
  { value: "image_generation", label: "图像生成" },
  { value: "image_edit", label: "图像编辑" },
  { value: "video_generation", label: "视频生成" },
  { value: "remove_background", label: "智能抠图" },
  { value: "upscale_image", label: "图像放大" },
  { value: "inpaint_image", label: "局部重绘" },
];

function loadStoredCosts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COST_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UNIT_COSTS };
    return { ...DEFAULT_UNIT_COSTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_UNIT_COSTS };
  }
}

function loadStoredMargin(): number {
  try {
    const n = Number(localStorage.getItem(MARGIN_STORAGE_KEY));
    if (Number.isFinite(n) && n >= 0 && n <= 85) return Math.round(n);
  } catch {
    /* ignore */
  }
  return 20; // early-stage friendly default
}

function persistCosts() {
  localStorage.setItem(COST_STORAGE_KEY, JSON.stringify(unitCosts.value));
}

watch(targetMarginPct, (v) => {
  localStorage.setItem(MARGIN_STORAGE_KEY, String(v));
});

const metrics = computed(() => [
  {
    label: "积分账户",
    value: formatInteger(overview.value?.accountCount || 0),
    help: "已建立积分账户",
    icon: Coin,
    bg: "#e0f2fe",
    color: "#0369a1",
  },
  {
    label: "流通积分",
    value: formatCredits(overview.value?.availableCredits || 0),
    help: `预留 ${formatCredits(overview.value?.reservedCredits || 0)}`,
    icon: Money,
    bg: "#dcfce7",
    color: "#15803d",
  },
  {
    label: "累计消耗",
    value: formatCredits(overview.value?.lifetimeSpentCredits || 0),
    help: `${formatInteger(overview.value?.capturedOperations || 0)} 笔已结算`,
    icon: TrendCharts,
    bg: "#ede9fe",
    color: "#6d28d9",
  },
  {
    label: "实收金额",
    value: `¥${formatMoney(overview.value?.paidAmountMinor || 0)}`,
    help: `${formatInteger(overview.value?.pendingOrders || 0)} 笔待支付`,
    icon: ShoppingCart,
    bg: "#ffedd5",
    color: "#c2410c",
  },
]);
const filteredAccounts = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  return key
    ? accounts.value.filter(
        (item) =>
          item.username.toLowerCase().includes(key) ||
          item.nickname?.toLowerCase().includes(key),
      )
    : accounts.value;
});
const paymentSetupMessage = computed(() => {
  const stripe = overview.value?.payment.stripe;
  if (stripe?.secretConfigured && !stripe.webhookConfigured) {
    return "Stripe 私钥已识别；还需配置 STRIPE_WEBHOOK_SECRET，验签到账启用后用户才能购买。";
  }
  return "配置 Stripe 私钥与 webhook 签名密钥后，用户端购买按钮会自动启用。";
});

const FALLBACK_PACKS = [
  { sku: "credits_500", name: "轻量包", credits: 500, amountMinor: 1900 },
  { sku: "credits_2000", name: "创作包", credits: 2000, amountMinor: 5900 },
  { sku: "credits_5000", name: "进阶包", credits: 5000, amountMinor: 12900 },
  { sku: "credits_20000", name: "团队包", credits: 20000, amountMinor: 39900 },
];

const packOptions = computed(() => {
  const list = products.value.length ? products.value : FALLBACK_PACKS;
  return list.map((p) => {
    const unit = p.credits > 0 ? p.amountMinor / 100 / p.credits : 0;
    return {
      sku: p.sku,
      label: `${p.name} · ¥${(p.amountMinor / 100).toFixed(2)} / ${p.credits} = ¥${unit.toFixed(4)}/积分`,
      unit,
      credits: p.credits,
      amountMinor: p.amountMinor,
    };
  });
});

const yuanPerCredit = computed(() => {
  if (creditPackSku.value === "__custom__") {
    return Math.max(0.0001, Number(customYuanPerCredit.value) || 0.03);
  }
  const pack = packOptions.value.find((p) => p.sku === creditPackSku.value);
  if (pack && pack.unit > 0) return pack.unit;
  return 0.0295;
});

const marginStageHint = computed(() => {
  const m = targetMarginPct.value;
  if (m <= 15) return "引流期：薄利甚至接近成本，适合拉新与口碑";
  if (m <= 30) return "冷启动：略有利润，兼顾获客与可持续";
  if (m <= 50) return "正常经营：常见 SaaS AI 毛利区间";
  return "高利润：上游优势明显或品牌溢价时可用";
});

const suggestedVideoCreditsPerSec = computed(() => {
  const cost = Number(unitCosts.value.video_generation) || 0;
  return Math.max(1, Math.ceil(creditsForTargetMargin(cost, 1)));
});

type ProfitRow = {
  rule: BillingPricingRule;
  scenarioLabel: string;
  currentCredits: number;
  costYuan: number;
  revenueYuan: number;
  currentMarginPct: number | null;
  suggestedCredits: number;
  suggestedRevenueYuan: number;
  canApply: boolean;
  applyPayload: {
    baseCredits: number;
    additionalCreditsPerSecond?: number;
    includedSeconds?: number;
    inputCreditsPerMillionTokens?: number;
    outputCreditsPerMillionTokens?: number;
  };
};

function creditsForTargetMargin(costYuan: number, units = 1): number {
  const m = Math.min(0.85, Math.max(0, targetMarginPct.value / 100));
  const denom = 1 - m;
  if (denom <= 0.001 || costYuan <= 0) return 0;
  const revenue = (costYuan * units) / denom;
  return Math.max(1, Math.ceil(revenue / yuanPerCredit.value));
}

function marginFrom(revenue: number, cost: number): number | null {
  if (revenue <= 0) return cost > 0 ? -100 : null;
  return ((revenue - cost) / revenue) * 100;
}

function ruleScenario(rule: BillingPricingRule): {
  label: string;
  credits: number;
  costYuan: number;
  units: number;
  applyPayload: ProfitRow["applyPayload"];
  canApply: boolean;
} {
  const cfg = (rule.config || {}) as Record<string, any>;
  const op = rule.operation;
  const base = Number(rule.baseCredits) || 0;

  if (op === "video_generation") {
    const included = Math.max(1, Number(cfg.includedSeconds ?? 5));

    // Scenario: included seconds block (typical default length)
    const credits = base;
    const costYuan = (Number(unitCosts.value.video_generation) || 0) * included;
    const creditsPerSec = creditsForTargetMargin(
      Number(unitCosts.value.video_generation) || 0,
      1,
    );
    return {
      label: `${included} 秒视频`,
      credits,
      costYuan,
      units: included,
      canApply: true,
      applyPayload: {
        baseCredits: creditsPerSec * included,
        additionalCreditsPerSecond: creditsPerSec,
        includedSeconds: included,
      },
    };
  }

  if (op === "llm_chat") {
    // 1M tokens mixed scenario
    const inRate = Number(rule.inputCreditsPerMillionTokens) || 0;
    const outRate = Number(rule.outputCreditsPerMillionTokens) || 0;
    const credits = inRate + outRate; // 1M in + 1M out roughly double — use avg of both for 1M total
    const costYuan = Number(unitCosts.value.llm_chat) || 0;
    const suggested = creditsForTargetMargin(costYuan, 1);
    const half = Math.max(1, Math.ceil(suggested / 2));
    return {
      label: "约 100 万 Token",
      credits: Math.max(inRate, outRate) || credits / 2 || 0,
      costYuan,
      units: 1,
      canApply: true,
      applyPayload: {
        baseCredits: 0,
        inputCreditsPerMillionTokens: half,
        outputCreditsPerMillionTokens: half,
      },
    };
  }

  // Per-call operations (image, edit, inpaint, remove_bg, upscale)
  const costKey =
    op === "image_edit"
      ? "image_edit"
      : op === "inpaint_image"
        ? "inpaint_image"
        : op === "remove_background"
          ? "remove_background"
          : op === "upscale_image"
            ? "upscale_image"
            : "image_generation";
  const costYuan =
    Number(unitCosts.value[costKey] ?? unitCosts.value.image_generation) || 0;
  const suggested = creditsForTargetMargin(costYuan, 1);
  return {
    label: "单次调用",
    credits: base,
    costYuan,
    units: 1,
    canApply: true,
    applyPayload: { baseCredits: suggested },
  };
}

const ruleProfitRows = computed<ProfitRow[]>(() => {
  return (pricing.value.rules || []).map((rule) => {
    const scenario = ruleScenario(rule);
    const revenueYuan = scenario.credits * yuanPerCredit.value;
    let suggestedCredits = scenario.applyPayload.baseCredits || 0;
    let suggestedRevenueYuan = suggestedCredits * yuanPerCredit.value;
    if (rule.operation === "video_generation") {
      suggestedCredits = scenario.applyPayload.baseCredits || 0;
      suggestedRevenueYuan = suggestedCredits * yuanPerCredit.value;
    } else if (rule.operation === "llm_chat") {
      suggestedCredits =
        scenario.applyPayload.inputCreditsPerMillionTokens || 0;
      suggestedRevenueYuan = suggestedCredits * yuanPerCredit.value;
    }
    return {
      rule,
      scenarioLabel: scenario.label,
      currentCredits: scenario.credits,
      costYuan: scenario.costYuan,
      revenueYuan,
      currentMarginPct: marginFrom(revenueYuan, scenario.costYuan),
      suggestedCredits,
      suggestedRevenueYuan,
      canApply: true,
      applyPayload: scenario.applyPayload,
    };
  });
});

const formLiveEstimate = computed(() => {
  const fakeRule: BillingPricingRule = {
    id: ruleForm.value.id || "draft",
    operation: ruleForm.value.operation,
    model: ruleForm.value.model || null,
    baseCredits: ruleForm.value.baseCredits,
    inputCreditsPerMillionTokens: ruleForm.value.inputCreditsPerMillionTokens,
    outputCreditsPerMillionTokens: ruleForm.value.outputCreditsPerMillionTokens,
    config: buildConfigPayloadFromForm(ruleForm.value),
  };
  const scenario = ruleScenario(fakeRule);
  const revenueYuan = scenario.credits * yuanPerCredit.value;
  return {
    scenarioLabel: scenario.label,
    revenueYuan,
    costYuan: scenario.costYuan,
    marginPct: marginFrom(revenueYuan, scenario.costYuan),
    suggestedCredits:
      fakeRule.operation === "video_generation"
        ? scenario.applyPayload.baseCredits || 0
        : fakeRule.operation === "llm_chat"
          ? scenario.applyPayload.inputCreditsPerMillionTokens || 0
          : scenario.applyPayload.baseCredits || 0,
    applyPayload: scenario.applyPayload,
  };
});

function buildConfigPayloadFromForm(form: ReturnType<typeof emptyRuleForm>) {
  if (form.operation === "video_generation") {
    return {
      includedSeconds: form.includedSeconds,
      additionalCreditsPerSecond: form.additionalCreditsPerSecond,
    };
  }
  if (
    form.operation === "image_generation" ||
    form.operation === "image_edit"
  ) {
    return {
      qualityMultipliers: { high: form.qualityHigh, hd: form.qualityHd },
      sizeMultipliers: {
        "2048x2048": form.size2048,
        "4096x4096": form.size4096,
        "4k": form.size4k,
      },
    };
  }
  if (form.operation === "upscale_image") {
    return { scaleMultipliers: { "2": form.scale2, "4": form.scale4 } };
  }
  return {};
}

function fillFormFromTargetMargin() {
  const payload = formLiveEstimate.value.applyPayload;
  if (ruleForm.value.operation === "video_generation") {
    ruleForm.value.baseCredits = payload.baseCredits;
    ruleForm.value.includedSeconds =
      payload.includedSeconds ?? ruleForm.value.includedSeconds;
    ruleForm.value.additionalCreditsPerSecond =
      payload.additionalCreditsPerSecond ??
      ruleForm.value.additionalCreditsPerSecond;
  } else if (ruleForm.value.operation === "llm_chat") {
    ruleForm.value.baseCredits = 0;
    ruleForm.value.inputCreditsPerMillionTokens =
      payload.inputCreditsPerMillionTokens || 0;
    ruleForm.value.outputCreditsPerMillionTokens =
      payload.outputCreditsPerMillionTokens || 0;
  } else {
    ruleForm.value.baseCredits = payload.baseCredits;
  }
  ElMessage.success(`已按目标毛利 ${targetMarginPct.value}% 填入建议积分`);
}

function onPackChange() {
  if (creditPackSku.value !== "__custom__") {
    const pack = packOptions.value.find((p) => p.sku === creditPackSku.value);
    if (pack && pack.unit > 0) customYuanPerCredit.value = pack.unit;
  }
}

function resetDefaultCosts() {
  unitCosts.value = { ...DEFAULT_UNIT_COSTS };
  persistCosts();
  ElMessage.success("已恢复默认上游成本假设");
}

function formatMargin(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value <= -100) return "亏损";
  return `${value.toFixed(0)}%`;
}

function marginTagType(
  value: number | null,
): "success" | "warning" | "danger" | "info" {
  if (value == null || !Number.isFinite(value)) return "info";
  if (value < 0) return "danger";
  if (value < 20) return "warning";
  if (value < 50) return "info";
  return "success";
}

function marginToneClass(pct: number) {
  if (pct < 20) return "tone-low";
  if (pct < 50) return "tone-mid";
  return "tone-high";
}

async function applySuggestedPricing(
  row: ProfitRow,
  options?: { silent?: boolean; skipReload?: boolean },
) {
  applyingRuleId.value = row.rule.id;
  try {
    const payload: any = {
      baseCredits: row.applyPayload.baseCredits,
    };
    if (row.rule.operation === "video_generation") {
      payload.config = {
        includedSeconds: row.applyPayload.includedSeconds ?? 5,
        additionalCreditsPerSecond:
          row.applyPayload.additionalCreditsPerSecond ?? 0,
      };
    } else if (row.rule.operation === "llm_chat") {
      payload.baseCredits = 0;
      payload.inputCreditsPerMillionTokens =
        row.applyPayload.inputCreditsPerMillionTokens;
      payload.outputCreditsPerMillionTokens =
        row.applyPayload.outputCreditsPerMillionTokens;
    } else {
      // Keep multipliers; strip display-only credit fields that might confuse video normalizer
      const cfg = { ...(row.rule.config || {}) } as Record<string, unknown>;
      delete cfg.additionalCreditsPerSecond;
      payload.config = cfg;
    }
    await updateBillingPricingRule(row.rule.id, payload);
    if (!options?.silent) {
      ElMessage.success(
        `${operationLabel(row.rule.operation)} 已按 ${targetMarginPct.value}% 毛利更新`,
      );
    }
    if (!options?.skipReload) {
      pricing.value = await getBillingPricing();
    }
  } catch (error: any) {
    if (!options?.silent) {
      ElMessage.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "套用失败",
      );
    }
    throw error;
  } finally {
    applyingRuleId.value = null;
  }
}

async function applyAllSuggested() {
  const rows = ruleProfitRows.value.filter((r) => !r.rule.model);
  if (!rows.length) {
    ElMessage.warning("没有可批量套用的默认规则");
    return;
  }
  const ok = await confirmAdminAction({
    title: "二次确认 · 批量改价",
    message: `将按目标毛利率 ${targetMarginPct.value}% 更新 ${rows.length} 条默认规则，立即影响新预扣。`,
    requireText: "确认改价",
    confirmButtonText: "批量套用",
    type: "warning",
  });
  if (!ok) return;
  bulkApplying.value = true;
  try {
    for (const row of rows) {
      await applySuggestedPricing(row, { silent: true, skipReload: true });
    }
    pricing.value = await getBillingPricing();
    ElMessage.success(
      `已批量套用 ${rows.length} 条规则（目标毛利 ${targetMarginPct.value}%）`,
    );
  } catch (error: any) {
    ElMessage.error(
      error?.response?.data?.message ||
        error?.response?.data?.error ||
        "批量套用失败",
    );
    pricing.value = await getBillingPricing();
  } finally {
    bulkApplying.value = false;
  }
}

function emptyRuleForm() {
  return {
    mode: "create" as "create" | "edit",
    id: "",
    operation: "video_generation",
    model: "",
    modelEditable: true,
    baseCredits: 0,
    inputCreditsPerMillionTokens: 0,
    outputCreditsPerMillionTokens: 0,
    priority: 0,
    includedSeconds: 5,
    additionalCreditsPerSecond: 100,
    qualityHigh: 2,
    qualityHd: 2,
    size2048: 2,
    size4096: 4,
    size4k: 4,
    scale2: 1,
    scale4: 1.5,
  };
}

async function loadAll() {
  loading.value = true;
  try {
    const [
      overviewResult,
      accountResult,
      orderResult,
      pricingResult,
      productsResult,
    ] = await Promise.all([
      getBillingOverview(),
      getBillingAccounts(),
      getBillingAdminOrders(orderStatusFilter.value),
      getBillingPricing(),
      getBillingProducts().catch(() => [] as BillingProductAdmin[]),
    ]);
    overview.value = overviewResult;
    accounts.value = accountResult;
    orders.value = orderResult.items;
    pricing.value = pricingResult;
    products.value = (productsResult || []).filter(
      (p) => p.status === "active" || !p.status,
    );
    if (
      products.value.length &&
      !products.value.some((p) => p.sku === creditPackSku.value)
    ) {
      creditPackSku.value = products.value[0].sku;
    }
    onPackChange();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || "加载计费数据失败");
  } finally {
    loading.value = false;
  }
}
async function loadOrders() {
  orders.value = (await getBillingAdminOrders(orderStatusFilter.value)).items;
}
function openAdjust(account: BillingAccountAdmin) {
  selectedAccount.value = account;
  adjustAmount.value = 0;
  adjustReason.value = "";
  adjustVisible.value = true;
}
async function submitAdjust() {
  if (
    !selectedAccount.value ||
    !adjustAmount.value ||
    !adjustReason.value.trim()
  ) {
    ElMessage.warning("请填写非零积分和调账原因");
    return;
  }
  const account = selectedAccount.value;
  const amount = adjustAmount.value;
  const reason = adjustReason.value.trim();
  const ok = await confirmAdminAction({
    title: "二次确认 · 积分调账",
    message: `将为 @${account.username} ${amount > 0 ? "发放" : "扣减"} ${Math.abs(amount)} 积分。\n原因：${reason}`,
    requireText: "确认调账",
    confirmButtonText: "执行调账",
    type: amount < 0 ? "error" : "warning",
  });
  if (!ok) return;

  adjusting.value = true;
  try {
    await adjustUserCredits(account.userId, amount, reason);
    ElMessage.success("调账已写入不可变账本");
    adjustVisible.value = false;
    await loadAll();
  } catch (error: any) {
    ElMessage.error(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        "调账失败",
    );
  } finally {
    adjusting.value = false;
  }
}

function openCreateRule() {
  ruleForm.value = emptyRuleForm();
  ruleForm.value.mode = "create";
  ruleForm.value.operation = "video_generation";
  ruleForm.value.baseCredits = 500;
  ruleForm.value.includedSeconds = 5;
  ruleForm.value.additionalCreditsPerSecond = 100;
  ruleVisible.value = true;
}

function openEditRule(row: BillingPricingRule) {
  const cfg = (row.config || {}) as Record<string, any>;
  const quality = cfg.qualityMultipliers || {};
  const size = cfg.sizeMultipliers || {};
  const scale = cfg.scaleMultipliers || {};
  ruleForm.value = {
    ...emptyRuleForm(),
    mode: "edit",
    id: row.id,
    operation: row.operation,
    model: row.model || "",
    modelEditable: Boolean(row.model),
    baseCredits: Number(row.baseCredits) || 0,
    inputCreditsPerMillionTokens: Number(row.inputCreditsPerMillionTokens) || 0,
    outputCreditsPerMillionTokens:
      Number(row.outputCreditsPerMillionTokens) || 0,
    priority: Number(row.priority ?? 0),
    includedSeconds: Number(cfg.includedSeconds ?? 5),
    additionalCreditsPerSecond: Number(
      cfg.additionalCreditsPerSecond ??
        (cfg.additionalMicrosPerSecond != null
          ? Number(cfg.additionalMicrosPerSecond) / 1_000_000
          : 0),
    ),
    qualityHigh: Number(quality.high ?? 2),
    qualityHd: Number(quality.hd ?? 2),
    size2048: Number(size["2048x2048"] ?? 2),
    size4096: Number(size["4096x4096"] ?? 4),
    size4k: Number(size["4k"] ?? 4),
    scale2: Number(scale["2"] ?? 1),
    scale4: Number(scale["4"] ?? 1.5),
  };
  ruleVisible.value = true;
}

function buildConfigPayload() {
  return buildConfigPayloadFromForm(ruleForm.value);
}

async function submitRule() {
  const form = ruleForm.value;
  if (!form.operation) {
    ElMessage.warning("请选择计费项目");
    return;
  }
  if (form.baseCredits < 0) {
    ElMessage.warning("基础积分不能为负");
    return;
  }
  ruleSaving.value = true;
  try {
    const payload = {
      operation: form.operation,
      model: form.model.trim() || null,
      baseCredits: form.baseCredits,
      inputCreditsPerMillionTokens: form.inputCreditsPerMillionTokens,
      outputCreditsPerMillionTokens: form.outputCreditsPerMillionTokens,
      priority: form.priority,
      config: buildConfigPayload(),
    };
    if (form.mode === "create") {
      await createBillingPricingRule(payload);
      ElMessage.success("计价规则已创建");
    } else {
      await updateBillingPricingRule(form.id, payload);
      ElMessage.success("计价规则已更新");
    }
    ruleVisible.value = false;
    pricing.value = await getBillingPricing();
  } catch (error: any) {
    ElMessage.error(
      error?.response?.data?.message ||
        error?.response?.data?.error ||
        "保存失败",
    );
  } finally {
    ruleSaving.value = false;
  }
}

async function removeRule(row: BillingPricingRule) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${operationLabel(row.operation)} / ${row.model}」的模型规则？`,
      "删除计价规则",
      { type: "warning" },
    );
    await deleteBillingPricingRule(row.id);
    ElMessage.success("已删除");
    pricing.value = await getBillingPricing();
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(
      error?.response?.data?.message ||
        error?.response?.data?.error ||
        "删除失败",
    );
  }
}

function configSummary(row: BillingPricingRule) {
  const cfg = (row.config || {}) as Record<string, any>;
  if (row.operation === "video_generation") {
    const included = cfg.includedSeconds ?? "—";
    const extra =
      cfg.additionalCreditsPerSecond ??
      (cfg.additionalMicrosPerSecond != null
        ? Number(cfg.additionalMicrosPerSecond) / 1_000_000
        : null);
    return `含 ${included} 秒 · 超出 ${extra != null ? formatCredits(Number(extra)) : "—"} 积分/秒`;
  }
  if (cfg.qualityMultipliers || cfg.sizeMultipliers) {
    const q = cfg.qualityMultipliers || {};
    const parts = [];
    if (q.high != null) parts.push(`high×${q.high}`);
    if (q.hd != null) parts.push(`hd×${q.hd}`);
    return parts.length ? parts.join(" · ") : "尺寸/质量倍率";
  }
  if (cfg.scaleMultipliers) {
    return Object.entries(cfg.scaleMultipliers)
      .map(([k, v]) => `${k}×${v}`)
      .join(" · ");
  }
  return "—";
}

function initials(row: BillingAccountAdmin) {
  return (row.nickname || row.username || "U").slice(0, 2).toUpperCase();
}
function formatCredits(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
    value,
  );
}
function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
function formatMoney(value: number) {
  return (value / 100).toFixed(2);
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function statusLabel(status: string) {
  return (
    (
      {
        pending: "待支付",
        paid: "已支付",
        closed: "已关闭",
        refunding: "退款中",
        refunded: "已退款",
      } as Record<string, string>
    )[status] || status
  );
}
function statusType(status: string) {
  return (
    (
      {
        pending: "warning",
        paid: "success",
        closed: "info",
        refunding: "warning",
        refunded: "info",
      } as Record<string, any>
    )[status] || "info"
  );
}
function operationLabel(operation: string) {
  return (
    (
      {
        llm_chat: "Agent 对话",
        image_generation: "图像生成",
        image_edit: "图像编辑",
        video_generation: "视频生成",
        remove_background: "智能抠图",
        upscale_image: "图像放大",
        inpaint_image: "局部重绘",
      } as Record<string, string>
    )[operation] || operation
  );
}
defineExpose({ refresh: loadAll });
onMounted(loadAll);
</script>

<style scoped>
.billing-admin {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.metric-card {
  height: 138px;
}
.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
  font-size: 13px;
  font-weight: 650;
}
.metric-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
}
.metric-card strong {
  display: block;
  margin-top: 4px;
  font-size: 27px;
  color: #0f172a;
  letter-spacing: -0.03em;
}
.metric-card small {
  color: #94a3b8;
  font-size: 11px;
}
.table-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 16px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}
.user-cell > div,
.order-id {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.user-cell strong,
.order-id strong {
  color: #0f172a;
  font-size: 13px;
}
.user-cell span,
.order-id span,
.subtext {
  color: #94a3b8;
  font-size: 11px;
}
.pricing-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin: 4px 0 18px;
  padding: 15px 17px;
  border-radius: 14px;
  background: #f8fafc;
}
.pricing-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pricing-head span {
  color: #64748b;
  font-size: 12px;
}
.pricing-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.config-summary {
  color: #475569;
  font-size: 12px;
}

.profit-planner {
  margin: 0 0 18px;
  padding: 16px 18px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border: 1px solid #e8ecf1;
}
.profit-planner__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.profit-planner__title h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
  color: #0f172a;
}
.profit-planner__title p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.profit-planner__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.profit-planner__controls {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.6fr;
  gap: 14px;
  align-items: start;
}
.profit-control label {
  display: block;
  font-size: 11px;
  font-weight: 650;
  color: #64748b;
  margin-bottom: 6px;
}
.slider-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}
.slider-head strong {
  font-size: 18px;
  font-weight: 800;
}
.slider-head strong.tone-low {
  color: #c2410c;
}
.slider-head strong.tone-mid {
  color: #0369a1;
}
.slider-head strong.tone-high {
  color: #15803d;
}
.slider-hint {
  margin-top: 16px;
  font-size: 11px;
  color: #94a3b8;
}
.cost-assumptions {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.cost-assumptions__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
  font-weight: 650;
  margin-bottom: 10px;
}
.cost-field {
  margin-bottom: 8px;
}
.cost-field label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.profit-summary {
  margin-top: 6px;
  font-size: 12px;
  color: #475569;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f1f5f9;
}
.profit-summary b {
  color: #0f172a;
}
.suggest-credits {
  color: #15803d;
}
.bulk-apply-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e8ecf1;
  font-size: 12px;
  color: #64748b;
}
.bulk-apply-bar b {
  color: #0f172a;
}
.rule-profit-box {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e8ecf1;
}
.rule-profit-box__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 650;
  color: #64748b;
  margin-bottom: 10px;
}
.rule-profit-box__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.rule-profit-box__metrics div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 8px;
  background: #fff;
}
.rule-profit-box__metrics label {
  font-size: 10px;
  color: #94a3b8;
}
.rule-profit-box__metrics b {
  font-size: 13px;
  color: #0f172a;
}
.rule-profit-box__slider {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 1100px) {
  .profit-planner__controls {
    grid-template-columns: 1fr;
  }
  .rule-profit-box__metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

.adjust-user {
  display: flex;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 14px;
  border-radius: 13px;
  background: #f8fafc;
}
.adjust-user span {
  color: #64748b;
}
.adjust-user strong {
  color: #0f172a;
}
.form-hint {
  margin-top: 7px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.45;
}
.video-hint {
  margin: -6px 0 8px;
}
</style>
