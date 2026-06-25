<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <el-tabs v-model="modelsSubTab" class="custom-models-tabs">
      <!-- Tab 1: Model Mappings -->
      <el-tab-pane label="模型映射映射表" name="mappings">
        <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 12px">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap">
            <el-input
              v-model="modelSearchQuery"
              placeholder="搜索模型名称 / 上游模型 / 渠道..."
              style="width: 300px"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>

          <el-table
            v-loading="mappingsLoading"
            :data="filteredMappings"
            style="width: 100%"
            border
          >
            <el-table-column label="图标" width="80" align="center">
              <template #default="{ row }">
                <img
                  v-if="row.iconUrl"
                  :src="row.iconUrl"
                  class="channel-avatar"
                  style="
                    width: 28px;
                    height: 28px;
                    object-fit: cover;
                    margin: 0 auto;
                    display: block;
                  "
                />
                <span
                  v-else-if="row.brandInitial"
                  class="channel-avatar"
                  :style="{
                    background: row.brandColor || 'linear-gradient(135deg, #475569, #94a3b8)',
                  }"
                  style="width: 28px; height: 28px; margin: 0 auto; display: flex; font-size: 11px"
                >
                  {{ row.brandInitial }}
                </span>
                <span
                  v-else
                  class="channel-avatar"
                  style="
                    background: linear-gradient(135deg, #475569, #94a3b8);
                    width: 28px;
                    height: 28px;
                    margin: 0 auto;
                    display: flex;
                    font-size: 11px;
                  "
                >
                  {{ row.label ? row.label.charAt(0).toUpperCase() : "M" }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="显示名称" prop="label" min-width="160" sortable>
              <template #default="{ row }">
                <span style="font-weight: 600; color: #fff">{{ row.label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="前端 ID" prop="id" min-width="160" sortable>
              <template #default="{ row }">
                <span style="font-family: monospace; display: flex; align-items: center; gap: 6px">
                  {{ row.id }}
                  <el-button
                    type="info"
                    :icon="CopyDocument"
                    link
                    @click="copyToClipboard(row.id)"
                  />
                </span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="getPurposeTagType(row.purpose)">{{ getPurposeText(row.purpose) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="关联公共模板" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.imageConfigId" style="color: #f97316; font-weight: 500">
                  模板: {{ row.imageConfigId }}
                </span>
                <span v-else style="color: #71717a">-</span>
              </template>
            </el-table-column>
            <el-table-column label="上游渠道" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ channelNameById(row.channelId) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="上游模型名" prop="upstreamModel" min-width="160" show-overflow-tooltip />
            <el-table-column label="启用" width="95" align="center">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.enabled"
                  @change="toggleMappingEnabled(row)"
                  :loading="mappingToggling[row.id]"
                  active-color="#f97316"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="center" fixed="right">
              <template #default="{ row }">
                <div style="display: flex; justify-content: center; gap: 8px">
                  <el-button size="small" type="primary" plain @click="openMappingModal(row)">
                    编辑
                  </el-button>
                  <el-popconfirm title="确定删除该模型映射吗？" @confirm="confirmDeleteMapping(row)">
                    <template #reference>
                      <el-button size="small" type="danger" plain>删除</el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Tab 2: Config Templates -->
      <el-tab-pane label="图像配置模板" name="templates">
        <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 12px">
          <el-table v-loading="mappingsLoading" :data="imageConfigs" style="width: 100%" border>
            <el-table-column label="模板 ID (配置 ID)" prop="id" min-width="150" sortable>
              <template #default="{ row }">
                <span style="font-family: monospace; font-weight: bold; color: #f97316">{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column label="模板名称" prop="label" min-width="150">
              <template #default="{ row }">
                <span style="font-weight: 600; color: #fff">{{ row.label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="分辨率选项 (Sizes)" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ row.sizes && row.sizes.length ? row.sizes.join(', ') : '未配置' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="宽高比选项 (Ratios)" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ row.aspectRatios && row.aspectRatios.length ? row.aspectRatios.join(', ') : '未配置' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="质量/尺寸档位" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ row.qualities && row.qualities.length ? row.qualities.join(', ') : '未配置' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="质量模式" prop="qualityMode" width="120" align="center" />
            <el-table-column label="最大生成数量" prop="maxGenerationCount" width="130" align="center">
              <template #default="{ row }">
                <span>{{ row.maxGenerationCount ?? 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="center" fixed="right">
              <template #default="{ row }">
                <div style="display: flex; justify-content: center; gap: 8px">
                  <el-button size="small" type="primary" plain @click="openTemplateModal(row)">
                    编辑
                  </el-button>
                  <el-popconfirm
                    title="确定删除该配置模板吗？关联了此模板的映射将失效。"
                    @confirm="confirmDeleteTemplate(row)"
                  >
                    <template #reference>
                      <el-button size="small" type="danger" plain>删除</el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Tab 3: Configuration Dictionaries -->
      <el-tab-pane label="参数配置字典" name="dictionaries">
        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 20px">
          <el-row :gutter="20">
            <!-- Sizes Dictionary -->
            <el-col :span="8">
              <el-card
                style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px"
              >
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff">可选分辨率字典 (Sizes)</span>
                </template>
                <div style="display: flex; flex-direction: column; gap: 12px">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 120px; align-content: flex-start; border: 1px solid #27272a; border-radius: 8px; padding: 12px; background-color: #09090b">
                    <el-tag
                      v-for="size in localDict.sizes"
                      :key="size"
                      closable
                      type="primary"
                      @close="removeDictItem('sizes', size)"
                    >
                      {{ size }}
                    </el-tag>
                    <span v-if="!localDict.sizes.length" style="color: #71717a; font-size: 13px">字典为空</span>
                  </div>
                  <div style="display: flex; gap: 8px">
                    <el-input
                      v-model="newDictItemInput.sizes"
                      placeholder="例如: 1024x1024"
                      size="small"
                      @keyup.enter="addDictItem('sizes')"
                    />
                    <el-button type="primary" size="small" @click="addDictItem('sizes')">添加</el-button>
                  </div>
                </div>
              </el-card>
            </el-col>

            <!-- Aspect Ratios Dictionary -->
            <el-col :span="8">
              <el-card
                style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px"
              >
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff">可选宽高比字典 (Aspect Ratios)</span>
                </template>
                <div style="display: flex; flex-direction: column; gap: 12px">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 120px; align-content: flex-start; border: 1px solid #27272a; border-radius: 8px; padding: 12px; background-color: #09090b">
                    <el-tag
                      v-for="ratio in localDict.aspectRatios"
                      :key="ratio"
                      closable
                      type="warning"
                      @close="removeDictItem('aspectRatios', ratio)"
                    >
                      {{ ratio }}
                    </el-tag>
                    <span v-if="!localDict.aspectRatios.length" style="color: #71717a; font-size: 13px">字典为空</span>
                  </div>
                  <div style="display: flex; gap: 8px">
                    <el-input
                      v-model="newDictItemInput.aspectRatios"
                      placeholder="例如: 16:9"
                      size="small"
                      @keyup.enter="addDictItem('aspectRatios')"
                    />
                    <el-button type="primary" size="small" @click="addDictItem('aspectRatios')">添加</el-button>
                  </div>
                </div>
              </el-card>
            </el-col>

            <!-- Qualities Dictionary -->
            <el-col :span="8">
              <el-card
                style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px"
              >
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff">可选质量/尺寸字典 (Qualities)</span>
                </template>
                <div style="display: flex; flex-direction: column; gap: 12px">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 120px; align-content: flex-start; border: 1px solid #27272a; border-radius: 8px; padding: 12px; background-color: #09090b">
                    <el-tag
                      v-for="q in localDict.qualities"
                      :key="q"
                      closable
                      type="success"
                      @close="removeDictItem('qualities', q)"
                    >
                      {{ q }}
                    </el-tag>
                    <span v-if="!localDict.qualities.length" style="color: #71717a; font-size: 13px">字典为空</span>
                  </div>
                  <div style="display: flex; gap: 8px">
                    <el-input
                      v-model="newDictItemInput.qualities"
                      placeholder="例如: standard"
                      size="small"
                      @keyup.enter="addDictItem('qualities')"
                    />
                    <el-button type="primary" size="small" @click="addDictItem('qualities')">添加</el-button>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <div style="display: flex; justify-content: flex-end">
            <el-button type="primary" :loading="savingDict" @click="saveDictionaries">保存字典配置</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Model Mapping Form Dialog -->
    <el-dialog
      v-model="mappingModalOpen"
      :title="editingMappingId ? '编辑模型映射' : '新增模型映射'"
      width="540px"
      destroy-on-close
      style="border-radius: 12px; background-color: #141416"
    >
      <el-form :model="mappingForm" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="前端 ID" required>
              <el-input
                v-model="mappingForm.id"
                placeholder="如 gpt-image-2"
                :disabled="!!editingMappingId"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示名称" required>
              <el-input v-model="mappingForm.label" placeholder="如 GPT Image 2" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模型类型">
              <el-select v-model="mappingForm.purpose" style="width: 100%">
                <el-option label="对话" value="chat" />
                <el-option label="图片" value="image" />
                <el-option label="视频" value="video" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上游渠道" required>
              <el-select
                v-model="mappingForm.channelId"
                style="width: 100%"
                placeholder="选择渠道"
                @change="onChannelChange"
              >
                <el-option
                  v-for="channel in channels"
                  :key="channel.id"
                  :label="channel.name"
                  :value="channel.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="上游模型名" required>
          <el-select
            v-model="mappingForm.upstreamModel"
            filterable
            allow-create
            default-first-option
            placeholder="请选择或直接输入上游模型名"
            :loading="loadingUpstreamModels"
            style="width: 100%"
          >
            <el-option
              v-for="modelId in availableUpstreamModels"
              :key="modelId"
              :label="modelId"
              :value="modelId"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="图标简称 (1-2字符)">
              <el-input v-model="mappingForm.brandInitial" placeholder="如 M" maxlength="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="背景色 (Hex或渐变值)">
              <el-input v-model="mappingForm.brandColor" placeholder="如 #f97316 或 linear-gradient(...)" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="图标图片 / 远程 URL">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input
              v-model="mappingForm.iconUrl"
              placeholder="输入远程图片 URL，或点击右侧上传"
              style="flex: 1"
            />
            <el-upload
              action=""
              :before-upload="beforeIconUpload"
              :show-file-list="false"
              accept="image/*"
            >
              <el-button type="info" plain>上传图片</el-button>
            </el-upload>
          </div>
        </el-form-item>

        <!-- Image Generation Advanced Custom Config (Only when purpose is 'image') -->
        <div v-if="mappingForm.purpose === 'image'" style="border-top: 1px dashed #27272a; margin-top: 16px; padding-top: 16px">
          <h4 style="margin: 0 0 12px 0; color: #fff; font-size: 13px; font-weight: 600">图像生成高级配置</h4>
          
          <el-form-item label="配置方式">
            <el-radio-group v-model="mappingFormConfigType" size="small">
              <el-radio-button label="template">使用公共模板</el-radio-button>
              <el-radio-button label="custom">手动自定义配置</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <!-- Choice A: Use shared configuration template -->
          <div v-if="mappingFormConfigType === 'template'">
            <el-form-item label="绑定公共配置模板" required>
              <el-select
                v-model="mappingForm.imageConfigId"
                placeholder="请选择配置模板"
                style="width: 100%"
                clearable
              >
                <el-option
                  v-for="cfg in imageConfigs"
                  :key="cfg.id"
                  :label="`${cfg.label} (${cfg.id})`"
                  :value="cfg.id"
                />
              </el-select>
              <div style="font-size: 11px; color: #71717a; margin-top: 4px">
                选择已有的公共配置模板，让该模型继承该配置。如果下拉框为空，请先在“图像配置模板”子页签中创建。
              </div>
            </el-form-item>
          </div>

          <!-- Choice B: Manual Customization -->
          <div v-else>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="可选分辨率列表 (Sizes)">
                  <el-select
                    v-model="mappingForm.sizes"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择预设或直接输入新增"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="item in dictionaries.sizes"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="默认分辨率">
                  <el-select
                    v-model="mappingForm.defaultSize"
                    filterable
                    allow-create
                    placeholder="选择或输入默认值"
                    style="width: 100%"
                    clearable
                  >
                    <el-option
                      v-for="item in mappingForm.sizes"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="质量控制模式">
                  <template #label>
                    <span style="display: inline-flex; align-items: center; gap: 4px">
                      质量控制模式
                      <el-tooltip placement="top" effect="dark">
                        <template #content>
                          <div style="font-size: 12px; line-height: 1.6">
                            <b>控制前端第二个下拉框显示的文字：</b><br />
                            • quality: 显示“质量”（如 DALL-E 的 standard/hd）<br />
                            • resolution: 显示“清晰度”（如 Grok 的 1k/2k）<br />
                            • preset: 显示“预设”（如 Flux/Qwen 的预设）<br />
                            • image_size: 显示“输出档位”（如 Gemini 的 1K/2K/4K）
                          </div>
                        </template>
                        <el-icon style="cursor: help; color: #a1a1aa"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                  <el-select v-model="mappingForm.qualityMode" style="width: 100%">
                    <el-option label="质量控制 (quality)" value="quality" />
                    <el-option label="分辨率 (resolution)" value="resolution" />
                    <el-option label="预设 (preset)" value="preset" />
                    <el-option label="图像尺寸 (image_size)" value="image_size" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="可选质量/尺寸列表 (Qualities)">
                  <el-select
                    v-model="mappingForm.qualities"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择预设或直接输入新增"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="item in dictionaries.qualities"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="默认质量">
                  <el-select
                    v-model="mappingForm.defaultQuality"
                    filterable
                    allow-create
                    placeholder="选择或输入默认值"
                    style="width: 100%"
                    clearable
                  >
                    <el-option
                      v-for="item in mappingForm.qualities"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="最大参考图数量">
                  <el-input-number
                    v-model="mappingForm.maxReferenceImages"
                    :min="0"
                    :max="16"
                    style="width: 100%"
                    placeholder="不填则按模型默认"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="可选宽高比列表 (Aspect Ratios)">
                  <el-select
                    v-model="mappingForm.aspectRatios"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择预设或直接输入新增"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="item in dictionaries.aspectRatios"
                      :key="item"
                      :label="item"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </div>
        </div>

        <el-form-item label="备注">
          <el-input
            v-model="mappingForm.notes"
            type="textarea"
            :rows="2"
            placeholder="输入模型特定的备注说明..."
          />
        </el-form-item>
        <el-form-item style="margin-bottom: 0">
          <el-checkbox v-model="mappingForm.enabled">启用此映射</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <div
          style="
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            border-top: 1px solid #27272a;
            padding-top: 16px;
          "
        >
          <el-button @click="closeMappingModal">取消</el-button>
          <el-button type="primary" @click="saveMapping">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Image Config Template Dialog -->
    <el-dialog
      v-model="templateModalOpen"
      :title="editingTemplateId ? '编辑图像配置模板' : '新增图像配置模板'"
      width="540px"
      destroy-on-close
      style="border-radius: 12px; background-color: #141416"
    >
      <el-form :model="templateForm" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模板 ID (英文标识)" required>
              <el-input
                v-model="templateForm.id"
                placeholder="如: gemini-preset, flux-preset"
                :disabled="!!editingTemplateId"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模板显示名称" required>
              <el-input v-model="templateForm.label" placeholder="如: Gemini 标准配置" />
            </el-form-item>
          </el-col>
        </el-row>

        <div style="border-top: 1px dashed #27272a; margin-top: 8px; padding-top: 16px">
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="可选分辨率列表 (Sizes)">
                <el-select
                  v-model="templateForm.sizes"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择预设或直接输入新增"
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in dictionaries.sizes"
                    :key="item"
                    :label="item"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="默认分辨率">
                <el-select
                  v-model="templateForm.defaultSize"
                  filterable
                  allow-create
                  placeholder="选择或输入默认值"
                  style="width: 100%"
                  clearable
                >
                  <el-option
                    v-for="item in templateForm.sizes"
                    :key="item"
                    :label="item"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="质量控制模式">
                <template #label>
                  <span style="display: inline-flex; align-items: center; gap: 4px">
                    质量控制模式
                    <el-tooltip placement="top" effect="dark">
                      <template #content>
                        <div style="font-size: 12px; line-height: 1.6">
                          <b>控制前端第二个下拉框显示的文字：</b><br />
                          • quality: 显示“质量”（如 DALL-E 的 standard/hd）<br />
                          • resolution: 显示“清晰度”（如 Grok 的 1k/2k）<br />
                          • preset: 显示“预设”（如 Flux/Qwen 的预设）<br />
                          • image_size: 显示“输出档位”（如 Gemini 的 1K/2K/4K）
                        </div>
                      </template>
                      <el-icon style="cursor: help; color: #a1a1aa"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <el-select v-model="templateForm.qualityMode" style="width: 100%">
                  <el-option label="质量控制 (quality)" value="quality" />
                  <el-option label="分辨率 (resolution)" value="resolution" />
                  <el-option label="预设 (preset)" value="preset" />
                  <el-option label="图像尺寸 (image_size)" value="image_size" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="可选质量/尺寸列表 (Qualities)">
                <el-select
                  v-model="templateForm.qualities"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择预设或直接输入新增"
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in dictionaries.qualities"
                    :key="item"
                    :label="item"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="默认质量">
                <el-select
                  v-model="templateForm.defaultQuality"
                  filterable
                  allow-create
                  placeholder="选择或输入默认值"
                  style="width: 100%"
                  clearable
                >
                  <el-option
                    v-for="item in templateForm.qualities"
                    :key="item"
                    :label="item"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="最大参考图数量">
                <el-input-number
                  v-model="templateForm.maxReferenceImages"
                  :min="0"
                  :max="16"
                  style="width: 100%"
                  placeholder="不填则按模型默认"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="最大生成数量">
                <el-input-number
                  v-model="templateForm.maxGenerationCount"
                  :min="1"
                  :max="100"
                  style="width: 100%"
                  placeholder="单次请求最大生成数量"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="可选宽高比列表 (Aspect Ratios)">
                <el-select
                  v-model="templateForm.aspectRatios"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择预设或直接输入新增"
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in dictionaries.aspectRatios"
                    :key="item"
                    :label="item"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <el-form-item label="备注说明 (Notes)">
          <el-input
            v-model="templateForm.notes"
            type="textarea"
            :rows="2"
            placeholder="输入此配置模板的描述或说明..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div
          style="
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            border-top: 1px solid #27272a;
            padding-top: 16px;
          "
        >
          <el-button @click="closeTemplateModal">取消</el-button>
          <el-button type="primary" @click="saveTemplate">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { Search, CopyDocument, QuestionFilled } from "@element-plus/icons-vue";
import {
  updateModelConfig,
  uploadImage,
  discoverChannelModels,
  type Channel,
  type ModelType,
  type ModelMapping,
  type ImageConfig,
} from "../utils/api";

const props = defineProps<{
  mappings: ModelMapping[];
  imageConfigs: ImageConfig[];
  channels: Channel[];
  dictionaries: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
  };
  mappingsLoading: boolean;
}>();

const emit = defineEmits<{
  (e: "refresh-mappings"): void;
}>();

const modelsSubTab = defineModel<"mappings" | "templates" | "dictionaries">("modelsSubTab", { default: "mappings" });

const modelSearchQuery = ref("");
const mappingToggling = ref<Record<string, boolean>>({});

const mappingModalOpen = ref(false);
const templateModalOpen = ref(false);
const editingMappingId = ref<string | null>(null);
const editingTemplateId = ref<string | null>(null);

// Configuration Dictionaries State
const localDict = ref<{
  sizes: string[];
  aspectRatios: string[];
  qualities: string[];
}>({
  sizes: [],
  aspectRatios: [],
  qualities: [],
});

const newDictItemInput = ref({
  sizes: "",
  aspectRatios: "",
  qualities: "",
});
const savingDict = ref(false);

watch(
  () => props.dictionaries,
  (newVal) => {
    if (newVal) {
      localDict.value = {
        sizes: [...(newVal.sizes || [])],
        aspectRatios: [...(newVal.aspectRatios || [])],
        qualities: [...(newVal.qualities || [])],
      };
    }
  },
  { immediate: true, deep: true }
);

function addDictItem(type: 'sizes' | 'aspectRatios' | 'qualities') {
  const val = newDictItemInput.value[type].trim();
  if (!val) return;
  if (!localDict.value[type].includes(val)) {
    localDict.value[type].push(val);
  }
  newDictItemInput.value[type] = "";
}

function removeDictItem(type: 'sizes' | 'aspectRatios' | 'qualities', val: string) {
  localDict.value[type] = localDict.value[type].filter((item) => item !== val);
}

async function saveDictionaries() {
  savingDict.value = true;
  try {
    await updateModelConfig({
      mappings: props.mappings,
      imageConfigs: props.imageConfigs,
      dictionaries: localDict.value,
    });
    ElMessage.success("配置字典已成功保存！");
    emit("refresh-mappings");
  } catch (err: any) {
    ElMessage.error("字典保存失败: " + (err.message || "未知错误"));
  } finally {
    savingDict.value = false;
  }
}

const emptyMappingForm = () => ({
  id: "",
  label: "",
  purpose: "chat" as ModelType,
  channelId: "",
  upstreamModel: "",
  enabled: true,
  notes: "",
  brandInitial: "",
  brandColor: "",
  iconUrl: "",
  sizes: [] as string[],
  qualities: [] as string[],
  aspectRatios: [] as string[],
  maxReferenceImages: undefined as number | undefined,
  defaultSize: "",
  defaultQuality: "",
  qualityMode: "quality",
  imageConfigId: "",
});

const emptyTemplateForm = () => ({
  id: "",
  label: "",
  sizes: [] as string[],
  qualities: [] as string[],
  aspectRatios: [] as string[],
  maxReferenceImages: undefined as number | undefined,
  defaultSize: "",
  defaultQuality: "",
  qualityMode: "quality",
  notes: "",
  maxGenerationCount: 1 as number | undefined,
});

const mappingForm = ref(emptyMappingForm());
const templateForm = ref(emptyTemplateForm());
const mappingFormConfigType = ref<"template" | "custom">("template");

const loadingUpstreamModels = ref(false);
const availableUpstreamModels = ref<string[]>([]);

const filteredMappings = computed(() => {
  const q = modelSearchQuery.value.trim().toLowerCase();
  const list = [...props.mappings];
  if (!q) return list;
  return list.filter((item) =>
    [item.id, item.label, item.upstreamModel, channelNameById(item.channelId)]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
});

function channelNameById(id: string) {
  return props.channels.find((c) => c.id === id)?.name || id;
}

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => ElMessage.success("已复制到剪贴板"))
    .catch(() => ElMessage.error("复制失败"));
}

function getPurposeText(type: ModelType) {
  return type === "chat" ? "对话" : type === "image" ? "图片" : "视频";
}

function getPurposeTagType(purpose: string) {
  if (purpose === "chat") return "primary";
  if (purpose === "image") return "warning";
  return "danger";
}

function openMappingModal(item?: ModelMapping) {
  editingMappingId.value = item?.id || null;
  if (item) {
    const hasInline = Array.isArray(item.sizes) || Array.isArray(item.qualities) || Array.isArray(item.aspectRatios) || typeof item.maxReferenceImages === 'number';
    mappingFormConfigType.value = item.imageConfigId ? 'template' : (hasInline ? 'custom' : 'template');
    
    mappingForm.value = {
      ...item,
      imageConfigId: item.imageConfigId || "",
      notes: item.notes || "",
      brandInitial: item.brandInitial || "",
      brandColor: item.brandColor || "",
      iconUrl: item.iconUrl || "",
      sizes: Array.isArray(item.sizes) ? [...item.sizes] : [],
      qualities: Array.isArray(item.qualities) ? [...item.qualities] : [],
      aspectRatios: Array.isArray(item.aspectRatios) ? [...item.aspectRatios] : [],
      maxReferenceImages: item.maxReferenceImages,
      defaultSize: item.defaultSize || "",
      defaultQuality: item.defaultQuality || "",
      qualityMode: item.qualityMode || "quality",
    };
  } else {
    mappingFormConfigType.value = 'template';
    mappingForm.value = emptyMappingForm();
  }
  mappingModalOpen.value = true;
  if (mappingForm.value.channelId) {
    void onChannelChange(mappingForm.value.channelId);
  }
}

function closeMappingModal() {
  mappingModalOpen.value = false;
  availableUpstreamModels.value = [];
}

function openTemplateModal(item?: ImageConfig) {
  editingTemplateId.value = item?.id || null;
  templateForm.value = item
    ? {
        ...item,
        sizes: Array.isArray(item.sizes) ? [...item.sizes] : [],
        qualities: Array.isArray(item.qualities) ? [...item.qualities] : [],
        aspectRatios: Array.isArray(item.aspectRatios) ? [...item.aspectRatios] : [],
        maxReferenceImages: item.maxReferenceImages,
        defaultSize: item.defaultSize || "",
        defaultQuality: item.defaultQuality || "",
        qualityMode: item.qualityMode || "quality",
        notes: item.notes || "",
        maxGenerationCount: item.maxGenerationCount ?? 1,
      }
    : emptyTemplateForm();
  templateModalOpen.value = true;
}

function closeTemplateModal() {
  templateModalOpen.value = false;
}

defineExpose({
  openMappingModal,
  openTemplateModal,
});

async function onChannelChange(channelId: string) {
  availableUpstreamModels.value = [];
  if (!channelId) return;

  const selectedCh = props.channels.find((c) => c.id === channelId);
  if (!selectedCh) return;

  if (
    selectedCh.models &&
    selectedCh.models.length > 0 &&
    !selectedCh.models.includes("*")
  ) {
    availableUpstreamModels.value = selectedCh.models;
    return;
  }

  loadingUpstreamModels.value = true;
  try {
    const res = await discoverChannelModels(channelId);
    if (res.success && res.models && res.models.length > 0) {
      availableUpstreamModels.value = res.models;
    }
  } catch (err) {
    console.warn("Failed to discover upstream models: ", err);
  } finally {
    loadingUpstreamModels.value = false;
  }
}

async function beforeIconUpload(file: File) {
  try {
    const res = await uploadImage(file);
    if (res && res.url) {
      mappingForm.value.iconUrl = res.url;
      ElMessage.success("图片上传成功");
    } else {
      ElMessage.error("图片上传失败：接口未返回 URL");
    }
  } catch (err: any) {
    console.error(err);
    ElMessage.error("图片上传失败：" + (err.message || "未知错误"));
  }
  return false;
}

async function saveMapping() {
  if (
    !mappingForm.value.id.trim() ||
    !mappingForm.value.label.trim() ||
    !mappingForm.value.channelId.trim() ||
    !mappingForm.value.upstreamModel.trim()
  ) {
    ElMessage.warning("请填写必填项");
    return;
  }
  const next: ModelMapping = {
    id: mappingForm.value.id.trim(),
    label: mappingForm.value.label.trim(),
    purpose: mappingForm.value.purpose,
    channelId: mappingForm.value.channelId.trim(),
    upstreamModel: mappingForm.value.upstreamModel.trim(),
    enabled: mappingForm.value.enabled,
    notes: mappingForm.value.notes?.trim() || undefined,
    brandInitial: mappingForm.value.brandInitial?.trim() || undefined,
    brandColor: mappingForm.value.brandColor?.trim() || undefined,
    iconUrl: mappingForm.value.iconUrl?.trim() || undefined,
  };

  // 1. Check duplicate Front-end ID (case-insensitive)
  const newIdLower = next.id.toLowerCase();
  const isDuplicateId = props.mappings.some(
    (m) => m.id.toLowerCase() === newIdLower && m.id !== editingMappingId.value
  );
  if (isDuplicateId) {
    ElMessage.warning(`前端 ID "${next.id}" 已存在，请使用其他 ID`);
    return;
  }

  // 2. Check duplicate channelId + upstreamModel (case-insensitive)
  const newChannelId = next.channelId;
  const newUpstreamModelLower = next.upstreamModel.toLowerCase();
  const isDuplicateModel = props.mappings.some(
    (m) =>
      m.channelId === newChannelId &&
      m.upstreamModel.toLowerCase() === newUpstreamModelLower &&
      m.id !== editingMappingId.value
  );
  if (isDuplicateModel) {
    ElMessage.warning(`上游渠道下已配置相同的上游模型 "${next.upstreamModel}"`);
    return;
  }

  if (next.purpose === "image") {
    if (mappingFormConfigType.value === "template") {
      next.imageConfigId = mappingForm.value.imageConfigId || undefined;
    } else {
      next.imageConfigId = undefined;
      
      if (mappingForm.value.sizes && mappingForm.value.sizes.length > 0) {
        next.sizes = mappingForm.value.sizes;
      }
      if (mappingForm.value.qualities && mappingForm.value.qualities.length > 0) {
        next.qualities = mappingForm.value.qualities;
      }
      if (mappingForm.value.aspectRatios && mappingForm.value.aspectRatios.length > 0) {
        next.aspectRatios = mappingForm.value.aspectRatios;
      }
      if (typeof mappingForm.value.maxReferenceImages === "number") {
        next.maxReferenceImages = mappingForm.value.maxReferenceImages;
      }
      if (mappingForm.value.defaultSize?.trim()) {
        next.defaultSize = mappingForm.value.defaultSize.trim();
      }
      if (mappingForm.value.defaultQuality?.trim()) {
        next.defaultQuality = mappingForm.value.defaultQuality.trim();
      }
      if (mappingForm.value.qualityMode?.trim()) {
        next.qualityMode = mappingForm.value.qualityMode.trim();
      }
    }
  }

  try {
    const current = [
      ...props.mappings.filter((item) => item.id !== editingMappingId.value),
      next,
    ];
    await updateModelConfig({
      mappings: current,
      imageConfigs: props.imageConfigs,
      dictionaries: props.dictionaries,
    });
    ElMessage.success("模型映射已保存");
    mappingModalOpen.value = false;
    emit("refresh-mappings");
  } catch (err: any) {
    ElMessage.error("保存失败: " + (err.message || "未知错误"));
  }
}

async function toggleMappingEnabled(item: ModelMapping) {
  if (mappingToggling.value[item.id]) return;
  mappingToggling.value[item.id] = true;
  try {
    item.enabled = !item.enabled;
    await updateModelConfig({
      mappings: props.mappings,
      imageConfigs: props.imageConfigs,
      dictionaries: props.dictionaries,
    });
    ElMessage.success(item.enabled ? "映射已启用" : "映射已禁用");
    emit("refresh-mappings");
  } catch (err: any) {
    item.enabled = !item.enabled;
    ElMessage.error("切换状态失败：" + (err.message || "未知错误"));
  } finally {
    mappingToggling.value[item.id] = false;
  }
}

function confirmDeleteMapping(item: ModelMapping) {
  const nextMappings = props.mappings.filter((m) => m.id !== item.id);
  updateModelConfig({
    mappings: nextMappings,
    imageConfigs: props.imageConfigs,
    dictionaries: props.dictionaries,
  })
    .then(() => {
      ElMessage.success("模型映射已删除");
      emit("refresh-mappings");
    })
    .catch((err) => {
      ElMessage.error("删除失败: " + (err.message || "未知错误"));
    });
}

async function saveTemplate() {
  if (!templateForm.value.id.trim() || !templateForm.value.label.trim()) {
    ElMessage.warning("请填写必填项");
    return;
  }
  
  const next: ImageConfig = {
    id: templateForm.value.id.trim(),
    label: templateForm.value.label.trim(),
    sizes: templateForm.value.sizes,
    qualities: templateForm.value.qualities,
    aspectRatios: templateForm.value.aspectRatios,
    maxReferenceImages: templateForm.value.maxReferenceImages,
    defaultSize: templateForm.value.defaultSize?.trim() || undefined,
    defaultQuality: templateForm.value.defaultQuality?.trim() || undefined,
    qualityMode: templateForm.value.qualityMode?.trim() || "quality",
    notes: templateForm.value.notes?.trim() || undefined,
    maxGenerationCount: templateForm.value.maxGenerationCount,
  };

  const newTemplateIdLower = next.id.toLowerCase();
  const isDuplicateTemplateId = props.imageConfigs.some(
    (c) => c.id.toLowerCase() === newTemplateIdLower && c.id !== editingTemplateId.value
  );
  if (isDuplicateTemplateId) {
    ElMessage.warning(`模板 ID "${next.id}" 已存在，请使用其他 ID`);
    return;
  }

  try {
    const current = [
      ...props.imageConfigs.filter((item) => item.id !== editingTemplateId.value),
      next,
    ];
    await updateModelConfig({
      mappings: props.mappings,
      imageConfigs: current,
      dictionaries: props.dictionaries,
    });
    ElMessage.success("配置模板已保存");
    templateModalOpen.value = false;
    emit("refresh-mappings");
  } catch (err: any) {
    ElMessage.error("保存失败: " + (err.message || "未知错误"));
  }
}

function confirmDeleteTemplate(item: ImageConfig) {
  const nextConfigs = props.imageConfigs.filter((c) => c.id !== item.id);
  updateModelConfig({
    mappings: props.mappings,
    imageConfigs: nextConfigs,
    dictionaries: props.dictionaries,
  })
    .then(() => {
      ElMessage.success("配置模板已删除");
      emit("refresh-mappings");
    })
    .catch((err) => {
      ElMessage.error("删除失败: " + (err.message || "未知错误"));
    });
}
</script>

<style scoped>
.channel-avatar {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
</style>
