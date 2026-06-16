<template>
  <el-container class="admin-dashboard-layout" style="height: 100vh; width: 100vw; background-color: #09090b;">
    <!-- Sidebar Navigation -->
    <el-aside width="240px" style="background-color: #141416; border-right: 1px solid #27272a; display: flex; flex-direction: column;">
      <div class="sidebar-header" style="padding: 24px 20px; border-bottom: 1px solid #27272a;">
        <span class="logo-text" style="font-size: 18px; font-weight: 700; color: #fff; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
          <el-icon style="color: #f97316;"><Cpu /></el-icon> Viboard Admin
        </span>
      </div>
      <el-menu
        :default-active="activeTab"
        style="border-right: none; background: transparent; flex: 1; padding: 16px 8px;"
        text-color="#a1a1aa"
        active-text-color="#f97316"
        @select="(key: string) => activeTab = key as any"
      >
        <el-menu-item index="dashboard" style="border-radius: 8px; margin-bottom: 4px; height: 48px;">
          <el-icon><Odometer /></el-icon>
          <span>系统概览</span>
        </el-menu-item>
        <el-menu-item index="channels" style="border-radius: 8px; margin-bottom: 4px; height: 48px;">
          <el-icon><Connection /></el-icon>
          <span>上游渠道管理</span>
        </el-menu-item>
        <el-menu-item index="models" style="border-radius: 8px; margin-bottom: 4px; height: 48px;">
          <el-icon><Files /></el-icon>
          <span>模型目录</span>
        </el-menu-item>
        <el-menu-item index="diagnostics" style="border-radius: 8px; height: 48px;">
          <el-icon><ChatLineRound /></el-icon>
          <span>路由与接口测试</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container style="display: flex; flex-direction: column; overflow: hidden;">
      <!-- Page Header -->
      <el-header style="height: 72px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding: 0 40px; background-color: #141416; flex-shrink: 0;">
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">
            {{ activeTab === 'dashboard' ? '系统概览' : activeTab === 'channels' ? '上游渠道管理' : activeTab === 'models' ? '模型目录' : '路由与接口测试' }}
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #a1a1aa;">
            {{ activeTab === 'dashboard' ? '企业级网关运行指标、信道延迟及配置统计' : activeTab === 'channels' ? '维护可用的上游渠道、密钥和路由优先级' : activeTab === 'models' ? '维护前端显示名、上游渠道、上游模型名及图标的映射表' : '测试模型映射关系并实时诊断接口延迟与底座返回负载' }}
          </p>
        </div>
        <div>
          <el-button v-if="activeTab === 'channels'" type="primary" @click="openChannelModal()">
            <el-icon style="margin-right: 4px;"><Plus /></el-icon>添加上游渠道
          </el-button>
          <el-button v-else-if="activeTab === 'models'" type="primary" @click="openMappingModal()">
            <el-icon style="margin-right: 4px;"><Plus /></el-icon>新增模型
          </el-button>
          <el-button v-else-if="activeTab === 'dashboard'" type="info" plain @click="refreshAllData()">
            <el-icon style="margin-right: 4px;"><Refresh /></el-icon>刷新数据
          </el-button>
        </div>
      </el-header>

      <!-- Main Contents -->
      <el-main style="padding: 30px 40px; overflow: auto; background-color: #09090b; display: flex; flex-direction: column; gap: 20px;">
        
        <!-- MODULE 1: System Dashboard -->
        <div v-if="activeTab === 'dashboard'" style="display: flex; flex-direction: column; gap: 24px;">
          <!-- 4 Stats Cards -->
          <el-row :gutter="20">
            <el-col :span="6">
              <el-card class="dashboard-stat-card" shadow="hover">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">信道数量 (已启用)</span>
                    <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff;">
                      {{ channels.filter(c => c.status).length }} <span style="font-size: 14px; color: #71717a; font-weight: normal;">/ {{ channels.length }}</span>
                    </h2>
                  </div>
                  <el-icon class="dashboard-stat-icon" style="color: #3b82f6;"><Connection /></el-icon>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="dashboard-stat-card" shadow="hover">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">模型映射 (已启用)</span>
                    <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff;">
                      {{ mappings.filter(m => m.enabled).length }} <span style="font-size: 14px; color: #71717a; font-weight: normal;">/ {{ mappings.length }}</span>
                    </h2>
                  </div>
                  <el-icon class="dashboard-stat-icon" style="color: #8b5cf6;"><Files /></el-icon>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="dashboard-stat-card" shadow="hover">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">路由状态</span>
                    <h2 style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; color: #10b981; display: flex; align-items: center; gap: 6px; height: 38px;">
                      <span class="status-pulse"></span> HEALTHY
                    </h2>
                  </div>
                  <el-icon class="dashboard-stat-icon" style="color: #10b981;"><Check /></el-icon>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card class="dashboard-stat-card" shadow="hover">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">网关平均延迟</span>
                    <h2 style="margin: 8px 0 0 0; font-size: 28px; font-weight: 700; color: #fff;">
                      {{ averageLatency }}
                    </h2>
                  </div>
                  <el-icon class="dashboard-stat-icon" style="color: #f97316;"><Timer /></el-icon>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <!-- Left Panel: Model Types Breakdown -->
            <el-col :span="12">
              <el-card style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px;">
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff;">模型类型分布</span>
                </template>
                <div style="display: flex; flex-direction: column; gap: 20px; padding: 10px 0;">
                  <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                      <span style="color: #a1a1aa;">文本对话模型 (Chat)</span>
                      <span style="color: #fff; font-weight: bold;">{{ mappings.filter(m => m.purpose === 'chat').length }} 个</span>
                    </div>
                    <el-progress :percentage="getPercentage('chat')" color="#3b82f6" :show-text="false" />
                  </div>
                  <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                      <span style="color: #a1a1aa;">AI 图像模型 (Image)</span>
                      <span style="color: #fff; font-weight: bold;">{{ mappings.filter(m => m.purpose === 'image').length }} 个</span>
                    </div>
                    <el-progress :percentage="getPercentage('image')" color="#eab308" :show-text="false" />
                  </div>
                  <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
                      <span style="color: #a1a1aa;">AI 视频模型 (Video)</span>
                      <span style="color: #fff; font-weight: bold;">{{ mappings.filter(m => m.purpose === 'video').length }} 个</span>
                    </div>
                    <el-progress :percentage="getPercentage('video')" color="#ef4444" :show-text="false" />
                  </div>
                </div>
              </el-card>
            </el-col>
            
            <!-- Right Panel: Channels Health Rank -->
            <el-col :span="12">
              <el-card style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px;">
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff;">信道调度表（权重降序）</span>
                </template>
                <el-table :data="sortedChannelsForDashboard" style="width: 100%;" size="small">
                  <el-table-column label="信道名称" prop="name">
                    <template #default="{ row }">
                      <span style="font-weight: 600; color: #fafafa;">{{ row.name }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="权重" prop="weight" width="70" align="center" />
                  <el-table-column label="类型" width="90" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" :type="getTagType(row.type)">{{ getTypeText(row.type) }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="80" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.status ? 'success' : 'danger'">{{ row.status ? '已启用' : '已禁用' }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="最近延迟" width="90" align="center">
                    <template #default="{ row }">
                      <span v-if="pingResults[row.id] && pingResults[row.id].success" style="color: #10b981; font-weight: 500;">
                        {{ pingResults[row.id].latency }}ms
                      </span>
                      <span v-else-if="pingResults[row.id]" style="color: #ef4444;">
                        FAIL
                      </span>
                      <span v-else style="color: #71717a;">
                        -
                      </span>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <!-- MODULE 2: Channels Section -->
        <div v-else-if="activeTab === 'channels'" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <el-input v-model="searchQuery" placeholder="搜索渠道名称..." style="width: 250px;" clearable>
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-select v-model="filterType" placeholder="选择类型" style="width: 140px;" clearable>
              <el-option label="全部模型" value="all" />
              <el-option label="文本模型" value="chat" />
              <el-option label="图像模型" value="image" />
              <el-option label="视频模型" value="video" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="选择状态" style="width: 140px;" clearable>
              <el-option label="已启用" value="active" />
              <el-option label="已禁用" value="inactive" />
            </el-select>
          </div>

          <el-table v-loading="loading" :data="filteredChannels" style="width: 100%;" border>
            <el-table-column label="渠道名称" min-width="160">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span class="channel-avatar">{{ row.name.charAt(0).toUpperCase() }}</span>
                  <span style="font-weight: 600; color: #fff;">{{ row.name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="getTagType(row.type)">{{ getTypeText(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="接口地址" prop="baseUrl" show-overflow-tooltip min-width="200" />
            <el-table-column label="API Key" min-width="190" align="center">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                  <span style="font-family: monospace; font-size: 12px; color: #e4e4e7;">
                    {{ showKeyMap[row.id] ? row.apiKey : maskValue(row.apiKey) }}
                  </span>
                  <el-button 
                    type="info" 
                    link 
                    :icon="showKeyMap[row.id] ? Hide : View" 
                    @click="showKeyMap[row.id] = !showKeyMap[row.id]" 
                    style="padding: 0; min-height: auto; height: auto;"
                  />
                  <el-button 
                    type="info" 
                    link 
                    :icon="CopyDocument" 
                    @click="copyToClipboard(row.apiKey)" 
                    style="padding: 0; min-height: auto; height: auto;"
                  />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="权重" prop="weight" width="80" align="center" sortable />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.status"
                  @change="toggleStatus(row)"
                  :loading="togglingMap[row.id]"
                  active-color="#f97316"
                />
              </template>
            </el-table-column>
            <el-table-column label="延迟" width="100" align="center">
              <template #default="{ row }">
                <div v-if="pingResults[row.id]">
                  <el-tag v-if="pingResults[row.id].success" type="success" size="small">
                    {{ pingResults[row.id].latency }}ms
                  </el-tag>
                  <el-tooltip v-else :content="pingResults[row.id].error" placement="top">
                    <el-tag type="danger" size="small" style="cursor: pointer;">错误 ❓</el-tag>
                  </el-tooltip>
                </div>
                <span v-else style="color: #71717a; font-size: 12px;">未测试</span>
              </template>
            </el-table-column>
            <el-table-column label="支持模型" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  <el-tag v-for="model in row.models" :key="model" size="small" type="info" effect="plain">
                    {{ model === '*' ? '全部 (*)' : model }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260" align="center" fixed="right">
              <template #default="{ row }">
                <div style="display: flex; justify-content: center; gap: 8px;">
                  <el-button size="small" :type="getPingBtnType(row.id)" @click="testConnection(row.id)" :loading="testingMap[row.id]">
                    测试
                  </el-button>
                  <el-button size="small" type="info" plain @click="refreshChannelModelsDirect(row)" :loading="refreshingModelsMap[row.id]">
                    同步模型
                  </el-button>
                  <el-button size="small" type="primary" plain @click="openChannelModal(row)">
                    编辑
                  </el-button>
                  <el-popconfirm title="确定删除该渠道吗？" @confirm="confirmDeleteChannel(row)">
                    <template #reference>
                      <el-button size="small" type="danger" plain>删除</el-button>
                    </template>
                  </el-popconfirm>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- MODULE 3: Model Mapping Section -->
        <div v-else-if="activeTab === 'models'" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <el-input v-model="modelSearchQuery" placeholder="搜索模型名称 / 上游模型 / 渠道..." style="width: 300px;" clearable>
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </div>

          <el-table v-loading="mappingsLoading" :data="filteredMappings" style="width: 100%;" border>
            <el-table-column label="图标" width="80" align="center">
              <template #default="{ row }">
                <img v-if="row.iconUrl" :src="row.iconUrl" class="channel-avatar" style="width: 28px; height: 28px; object-fit: cover; margin: 0 auto; display: block;" />
                <span v-else-if="row.brandInitial" class="channel-avatar" :style="{ background: row.brandColor || 'linear-gradient(135deg, #475569, #94a3b8)' }" style="width: 28px; height: 28px; margin: 0 auto; display: flex; font-size: 11px;">
                  {{ row.brandInitial }}
                </span>
                <span v-else class="channel-avatar" :style="{ background: 'linear-gradient(135deg, #475569, #94a3b8)' }" style="width: 28px; height: 28px; margin: 0 auto; display: flex; font-size: 11px;">
                  {{ row.label ? row.label.charAt(0).toUpperCase() : 'M' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="显示名称" prop="label" min-width="160" sortable>
              <template #default="{ row }">
                <span style="font-weight: 600; color: #fff;">{{ row.label }}</span>
              </template>
            </el-table-column>
            <el-table-column label="前端 ID" prop="id" min-width="160" sortable>
              <template #default="{ row }">
                <span style="font-family: monospace; display: flex; align-items: center; gap: 6px;">
                  {{ row.id }}
                  <el-button type="info" :icon="CopyDocument" link @click="copyToClipboard(row.id)" />
                </span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="getPurposeTagType(row.purpose)">{{ getPurposeText(row.purpose) }}</el-tag>
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
                <div style="display: flex; justify-content: center; gap: 8px;">
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

        <!-- MODULE 4: Diagnostics Playground -->
        <div v-else-if="activeTab === 'diagnostics'" style="display: flex; flex-direction: column; gap: 20px; height: 100%;">
          <el-row :gutter="24" style="height: 100%; display: flex; align-items: stretch;">
            <!-- Left Parameter Configuration Panel -->
            <el-col :span="10">
              <el-card style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px; height: 100%; display: flex; flex-direction: column;">
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px;">
                    <el-icon style="color: #f97316;"><Setting /></el-icon> 测试参数配置
                  </span>
                </template>
                <el-form label-position="top">
                  <el-form-item label="测试模型" required>
                    <el-select v-model="sandboxModel" placeholder="选择需要测试的前端模型" style="width: 100%;">
                      <el-option
                        v-for="mapping in mappings.filter(m => m.enabled)"
                        :key="mapping.id"
                        :label="`${mapping.label} (${mapping.id})`"
                        :value="mapping.id"
                      />
                    </el-select>
                  </el-form-item>

                  <div v-if="sandboxModelPurpose" style="margin-top: 10px; border-top: 1px solid #27272a; padding-top: 16px;">
                    <div style="margin-bottom: 12px;">
                      <el-tag :type="getPurposeTagType(sandboxModelPurpose)">
                        模型类型：{{ getPurposeText(sandboxModelPurpose) }}
                      </el-tag>
                    </div>

                    <!-- Chat options -->
                    <div v-if="sandboxModelPurpose === 'chat'">
                      <el-row :gutter="16">
                        <el-col :span="12">
                          <el-form-item label="温度 (Temperature)">
                            <el-input-number v-model="sandboxTemperature" :min="0" :max="2" :step="0.1" style="width: 100%;" />
                          </el-form-item>
                        </el-col>
                        <el-col :span="12">
                          <el-form-item label="最大 Tokens">
                            <el-input-number v-model="sandboxMaxTokens" :min="1" :max="8192" style="width: 100%;" />
                          </el-form-item>
                        </el-col>
                      </el-row>
                    </div>

                    <!-- Image options -->
                    <div v-if="sandboxModelPurpose === 'image'">
                      <el-row :gutter="16">
                        <el-col :span="8">
                          <el-form-item label="画幅比例">
                            <el-select v-model="sandboxAspectRatio" style="width: 100%;">
                              <el-option label="1:1 方图" value="1:1" />
                              <el-option label="16:9 宽屏" value="16:9" />
                              <el-option label="9:16 竖屏" value="9:16" />
                              <el-option label="4:3" value="4:3" />
                              <el-option label="3:4" value="3:4" />
                            </el-select>
                          </el-form-item>
                        </el-col>
                        <el-col :span="8">
                          <el-form-item label="生成分辨率">
                            <el-select v-model="sandboxSize" style="width: 100%;">
                              <el-option label="1024x1024" value="1024x1024" />
                              <el-option label="1536x1024" value="1536x1024" />
                              <el-option label="2048x2048" value="2048x2048" />
                              <el-option label="Auto" value="auto" />
                            </el-select>
                          </el-form-item>
                        </el-col>
                        <el-col :span="8">
                          <el-form-item label="生成质量">
                            <el-select v-model="sandboxQuality" style="width: 100%;">
                              <el-option label="Standard" value="standard" />
                              <el-option label="HD" value="hd" />
                              <el-option label="Auto" value="auto" />
                            </el-select>
                          </el-form-item>
                        </el-col>
                      </el-row>
                    </div>

                    <el-form-item :label="sandboxModelPurpose === 'chat' ? '对话输入 (Prompt)' : '生成提示词 (Prompt)'" required>
                      <el-input
                        v-model="sandboxPrompt"
                        type="textarea"
                        :rows="4"
                        placeholder="输入提示词..."
                      />
                    </el-form-item>
                  </div>
                  
                  <el-button
                    type="primary"
                    :loading="sandboxTesting"
                    style="width: 100%; margin-top: 10px;"
                    @click="runSandboxTest"
                  >
                    发送测试请求
                  </el-button>
                </el-form>
              </el-card>
            </el-col>

            <!-- Right Results & Diagnostics Terminal Panel -->
            <el-col :span="14" style="display: flex; flex-direction: column; gap: 16px;">
              <!-- Response Preview -->
              <el-card style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px; flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                <template #header>
                  <span style="font-size: 14px; font-weight: 600; color: #fff;">渲染预览</span>
                </template>
                <div style="flex: 1; overflow: auto; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 250px; padding: 10px;">
                  <div v-if="sandboxTesting && !sandboxImageUrl && !sandboxVideoUrl && !sandboxChatResponse" style="text-align: center; color: #a1a1aa;">
                    <el-icon class="is-loading" style="font-size: 32px; color: #f97316; margin-bottom: 12px;"><Refresh /></el-icon>
                    <div>{{ sandboxProgressText }}</div>
                  </div>
                  <div v-else-if="!sandboxResultType" style="color: #71717a; font-size: 14px;">
                    等待配置参数并提交测试
                  </div>
                  
                  <!-- Render chat result -->
                  <div v-else-if="sandboxResultType === 'chat' && sandboxChatResponse" style="width: 100%;" class="sandbox-chat-container">
                    <div class="chat-bubble user">
                      {{ sandboxPrompt }}
                    </div>
                    <div class="chat-bubble assistant">
                      {{ sandboxChatResponse }}
                    </div>
                  </div>
                  
                  <!-- Render image result -->
                  <div v-else-if="sandboxResultType === 'image' && sandboxImageUrl" style="text-align: center;">
                    <el-image
                      :src="sandboxImageUrl"
                      :preview-src-list="[sandboxImageUrl]"
                      style="max-width: 100%; max-height: 350px; border-radius: 8px; border: 1px solid #27272a;"
                      fit="contain"
                    />
                  </div>
                  
                  <!-- Render video result -->
                  <div v-else-if="sandboxResultType === 'video' && sandboxVideoUrl" style="width: 100%; text-align: center;">
                    <video
                      :src="sandboxVideoUrl"
                      controls
                      autoplay
                      style="max-width: 100%; max-height: 350px; border-radius: 8px; border: 1px solid #27272a; background-color: #000;"
                    />
                  </div>
                </div>
              </el-card>

              <!-- Diagnostic Stats Info -->
              <el-card v-if="sandboxRoutingInfo" style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px;">
                <div style="display: flex; justify-content: space-around; text-align: center; padding: 5px 0;">
                  <div>
                    <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 4px;">路由信道</div>
                    <el-tag size="small" type="success">{{ sandboxRoutingInfo.channelName }}</el-tag>
                  </div>
                  <div>
                    <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 4px;">底座模型 (Upstream ID)</div>
                    <el-tag size="small" type="info">{{ sandboxRoutingInfo.upstreamModel }}</el-tag>
                  </div>
                  <div>
                    <div style="font-size: 12px; color: #a1a1aa; margin-bottom: 4px;">响应总延迟</div>
                    <span style="color: #f97316; font-weight: bold; font-size: 15px;">{{ sandboxRoutingInfo.latency }} ms</span>
                  </div>
                </div>
              </el-card>

              <!-- JSON output log terminal -->
              <el-card style="background-color: #141416; border: 1px solid #27272a; border-radius: 12px;">
                <template #header>
                  <span style="font-size: 13px; font-weight: 600; color: #fff;">接口原始 JSON 响应</span>
                </template>
                <div class="diagnostic-terminal">
                  <span v-if="sandboxRawJson">{{ JSON.stringify(sandboxRawJson, null, 2) }}</span>
                  <span v-else style="color: #71717a;">（等待请求发送以捕获响应包）</span>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-main>
    </el-container>

    <!-- Channel Form Dialog -->
    <el-dialog
      v-model="channelModalOpen"
      :title="editingChannelId ? '编辑上游渠道' : '新增上游渠道'"
      width="540px"
      destroy-on-close
      style="border-radius: 12px; background-color: #141416;"
    >
      <el-form :model="channelForm" label-position="top">
        <el-form-item label="渠道名称" required>
          <el-input v-model="channelForm.name" placeholder="输入渠道展示名称，如 阿里云魔搭" />
        </el-form-item>
        <el-form-item label="接口地址" required>
          <el-input v-model="channelForm.baseUrl" placeholder="https://api.example.com/v1" />
        </el-form-item>
        <el-form-item label="API Key (密钥)">
          <el-input v-model="channelForm.apiKey" type="password" placeholder="留空则使用已保存的值或不使用密码" show-password />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="渠道类型">
              <el-select v-model="channelForm.type" style="width: 100%;">
                <el-option label="全部模型" value="all" />
                <el-option label="文本" value="chat" />
                <el-option label="图片" value="image" />
                <el-option label="视频" value="video" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="权重 (调度优先级)">
              <el-input-number v-model="channelForm.weight" :min="1" :max="100" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="支持上游模型列表 (以逗号分隔)">
          <div style="display: flex; gap: 8px; width: 100%;">
            <el-input v-model="channelForm.modelsRaw" placeholder="*, gpt-4o, veo_3_1_fast_vip" style="flex: 1;" />
            <el-button type="info" plain :loading="discoveringModels" @click="discoverModelsForForm">
              拉取上游模型
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="channelForm.notes" type="textarea" :rows="2" placeholder="输入关乎此渠道的备注信息..." />
        </el-form-item>
        <el-form-item style="margin-bottom: 0;">
          <el-checkbox v-model="channelForm.status">启用此渠道</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #27272a; padding-top: 16px;">
          <el-button @click="closeChannelModal">取消</el-button>
          <el-button type="primary" @click="saveChannel">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Model Mapping Form Dialog -->
    <el-dialog
      v-model="mappingModalOpen"
      :title="editingMappingId ? '编辑模型映射' : '新增模型映射'"
      width="540px"
      destroy-on-close
      style="border-radius: 12px; background-color: #141416;"
    >
      <el-form :model="mappingForm" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="前端 ID" required>
              <el-input v-model="mappingForm.id" placeholder="如 gpt-image-2" :disabled="!!editingMappingId" />
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
              <el-select v-model="mappingForm.purpose" style="width: 100%;">
                <el-option label="对话" value="chat" />
                <el-option label="图片" value="image" />
                <el-option label="视频" value="video" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="上游渠道" required>
              <el-select v-model="mappingForm.channelId" style="width: 100%;" placeholder="选择渠道" @change="onChannelChange">
                <el-option v-for="channel in channels" :key="channel.id" :label="channel.name" :value="channel.id" />
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
            style="width: 100%;"
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
          <div style="display: flex; gap: 8px; width: 100%;">
            <el-input v-model="mappingForm.iconUrl" placeholder="输入远程图片 URL，或点击右侧上传" style="flex: 1;" />
            <el-upload
              action=""
              :before-upload="beforeIconUpload"
              :show-file-list="false"
            >
              <el-button type="info" plain>上传图片</el-button>
            </el-upload>
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="mappingForm.notes" type="textarea" :rows="2" placeholder="输入模型特定的备注说明..." />
        </el-form-item>
        <el-form-item style="margin-bottom: 0;">
          <el-checkbox v-model="mappingForm.enabled">启用此映射</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #27272a; padding-top: 16px;">
          <el-button @click="closeMappingModal">取消</el-button>
          <el-button type="primary" @click="saveMapping">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { 
  Connection, 
  Files, 
  Plus, 
  Search,
  Odometer,
  Cpu,
  ChatLineRound,
  Refresh,
  Check,
  Timer,
  CopyDocument,
  Setting,
  View,
  Hide
} from '@element-plus/icons-vue';
import { 
  createChannel, 
  deleteChannel, 
  getChannels, 
  getModelConfig, 
  testChannelConnection, 
  updateChannel, 
  updateModelConfig, 
  uploadImage,
  discoverChannelModels,
  discoverModelsWithCredentials,
  testChat,
  testGenerateImage,
  testGenerateVideo,
  pollTaskStatus,
  type Channel, 
  type ModelType 
} from './utils/api';

interface ModelMapping {
  id: string;
  label: string;
  purpose: ModelType;
  channelId: string;
  upstreamModel: string;
  enabled: boolean;
  notes?: string;
  brandInitial?: string;
  brandColor?: string;
  iconUrl?: string;
}

const activeTab = ref<'dashboard' | 'channels' | 'models' | 'diagnostics'>('dashboard');
const channels = ref<Channel[]>([]);
const mappings = ref<ModelMapping[]>([]);
const loading = ref(false);
const mappingsLoading = ref(false);
const searchQuery = ref('');
const filterType = ref('');
const filterStatus = ref('');
const modelSearchQuery = ref('');
const testingMap = ref<Record<string, boolean>>({});
const togglingMap = ref<Record<string, boolean>>({});
const mappingToggling = ref<Record<string, boolean>>({});
const pingResults = ref<Record<string, { success: boolean; latency?: number; error?: string }>>({});
const refreshingModelsMap = ref<Record<string, boolean>>({});
const showKeyMap = ref<Record<string, boolean>>({});

function maskValue(key: string): string {
  if (!key) return "未配置";
  if (key.length <= 10) return "••••••••";
  return `${key.substring(0, 6)}••••${key.substring(key.length - 4)}`;
}


const channelModalOpen = ref(false);
const mappingModalOpen = ref(false);
const editingChannelId = ref<string | null>(null);
const editingMappingId = ref<string | null>(null);

const emptyChannelForm = () => ({ name: '', baseUrl: '', apiKey: '', type: 'all' as 'image' | 'chat' | 'video' | 'all', weight: 10, modelsRaw: '*', status: true, notes: '' });
const emptyMappingForm = () => ({ id: '', label: '', purpose: 'chat' as ModelType, channelId: '', upstreamModel: '', enabled: true, notes: '', brandInitial: '', brandColor: '', iconUrl: '' });

const channelForm = ref(emptyChannelForm());
const mappingForm = ref(emptyMappingForm());

// Upstream models discovery states
const discoveringModels = ref(false);
const availableUpstreamModels = ref<string[]>([]);
const loadingUpstreamModels = ref(false);

// Diagnostics Playground states
const sandboxModel = ref('');
const sandboxPrompt = ref('画一只可爱的橙色猫咪，皮克斯3D风格');
const sandboxTemperature = ref(0.7);
const sandboxMaxTokens = ref(1024);
const sandboxSize = ref('1024x1024');
const sandboxQuality = ref('standard');
const sandboxAspectRatio = ref('1:1');

const sandboxTesting = ref(false);
const sandboxResultType = ref<'chat' | 'image' | 'video' | null>(null);
const sandboxChatResponse = ref('');
const sandboxImageUrl = ref('');
const sandboxVideoUrl = ref('');
const sandboxRoutingInfo = ref<{ channelName: string; upstreamModel: string; latency: number } | null>(null);
const sandboxRawJson = ref<any>(null);
const sandboxProgressText = ref('');

// Computed properties for Dashboard
const averageLatency = computed(() => {
  const testedList = Object.values(pingResults.value).filter(r => r.success && typeof r.latency === 'number');
  if (testedList.length === 0) return '未测试';
  const sum = testedList.reduce((acc, r) => acc + (r.latency || 0), 0);
  return `${Math.round(sum / testedList.length)} ms`;
});

const sortedChannelsForDashboard = computed(() => {
  return [...channels.value].sort((a, b) => b.weight - a.weight);
});

function getPercentage(purpose: ModelType): number {
  if (mappings.value.length === 0) return 0;
  const count = mappings.value.filter(m => m.purpose === purpose).length;
  return Math.round((count / mappings.value.length) * 100);
}

const sandboxModelPurpose = computed(() => {
  if (!sandboxModel.value) return null;
  return mappings.value.find(m => m.id === sandboxModel.value)?.purpose || null;
});

const filteredChannels = computed(() => {
  let list = [...channels.value].sort((a, b) => b.weight - a.weight);
  if (searchQuery.value.trim()) list = list.filter((c) => c.name.toLowerCase().includes(searchQuery.value.toLowerCase()));
  if (filterType.value) list = list.filter((c) => c.type === filterType.value);
  if (filterStatus.value) list = list.filter((c) => (filterStatus.value === 'active' ? c.status : !c.status));
  return list;
});

const filteredMappings = computed(() => {
  const q = modelSearchQuery.value.trim().toLowerCase();
  const list = [...mappings.value];
  if (!q) return list;
  return list.filter((item) => [item.id, item.label, item.upstreamModel, channelNameById(item.channelId)].join(' ').toLowerCase().includes(q));
});

function getTypeText(type: string) { return type === 'all' ? '全部模型' : type === 'chat' ? '文本模型' : type === 'image' ? '图像模型' : '视频模型'; }
function getPurposeText(type: ModelType) { return type === 'chat' ? '对话' : type === 'image' ? '图片' : '视频'; }
function channelNameById(id: string) { return channels.value.find((c) => c.id === id)?.name || id; }

function getTagType(type: string) {
  if (type === 'all') return 'success';
  if (type === 'chat') return 'primary';
  if (type === 'image') return 'warning';
  return 'danger';
}

function getPurposeTagType(purpose: string) {
  if (purpose === 'chat') return 'primary';
  if (purpose === 'image') return 'warning';
  return 'danger';
}

function getPingBtnType(id: string) {
  const testResult = pingResults.value[id];
  if (!testResult) return 'info';
  return testResult.success ? 'success' : 'danger';
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
    .then(() => ElMessage.success('已复制到剪贴板'))
    .catch(() => ElMessage.error('复制失败'));
}

async function loadChannels() { loading.value = true; try { channels.value = await getChannels(); } catch (err) { console.error(err); ElMessage.error('加载渠道列表失败'); } finally { loading.value = false; } }
async function loadMappings() { mappingsLoading.value = true; try { const cfg = await getModelConfig(); mappings.value = (cfg.mappings || []) as ModelMapping[]; } catch (err) { console.error(err); ElMessage.error('加载模型目录失败'); } finally { mappingsLoading.value = false; } }

async function refreshAllData() {
  await loadChannels();
  await loadMappings();
  ElMessage.success('数据已刷新');
}

function openChannelModal(channel?: Channel) { editingChannelId.value = channel?.id || null; channelForm.value = channel ? { name: channel.name, baseUrl: channel.baseUrl, apiKey: '', type: channel.type, weight: channel.weight, modelsRaw: channel.models.join(', '), status: channel.status, notes: channel.notes || '' } : emptyChannelForm(); channelModalOpen.value = true; }
function closeChannelModal() { channelModalOpen.value = false; }

function openMappingModal(item?: ModelMapping) { 
  editingMappingId.value = item?.id || null; 
  mappingForm.value = item ? { ...item, notes: item.notes || '', brandInitial: item.brandInitial || '', brandColor: item.brandColor || '', iconUrl: item.iconUrl || '' } : emptyMappingForm(); 
  mappingModalOpen.value = true; 
  if (mappingForm.value.channelId) {
    void onChannelChange(mappingForm.value.channelId);
  }
}
function closeMappingModal() { mappingModalOpen.value = false; availableUpstreamModels.value = []; }

async function discoverModelsForForm() {
  if (!channelForm.value.baseUrl.trim()) {
    ElMessage.warning('请先填写接口地址');
    return;
  }
  discoveringModels.value = true;
  try {
    const res = await discoverModelsWithCredentials(channelForm.value.baseUrl.trim(), channelForm.value.apiKey.trim());
    if (res.success && res.models && res.models.length > 0) {
      channelForm.value.modelsRaw = res.models.join(', ');
      ElMessage.success(`成功拉取到 ${res.models.length} 个上游模型！`);
    } else {
      ElMessage.error(res.error || '未拉取到可用模型，请确认接口地址与密钥是否正确');
    }
  } catch (err: any) {
    ElMessage.error('拉取失败: ' + (err.message || '未知错误'));
  } finally {
    discoveringModels.value = false;
  }
}

async function refreshChannelModelsDirect(channel: Channel) {
  if (refreshingModelsMap.value[channel.id]) return;
  refreshingModelsMap.value[channel.id] = true;
  try {
    const res = await discoverChannelModels(channel.id);
    if (res.success && res.models && res.models.length > 0) {
      const payload = {
        ...channel,
        models: res.models
      };
      await updateChannel(channel.id, payload);
      ElMessage.success(`信道 [${channel.name}] 成功同步 ${res.models.length} 个可用模型！`);
      await loadChannels();
    } else {
      ElMessage.error(res.error || '同步失败：上游未返回可用模型列表');
    }
  } catch (err: any) {
    ElMessage.error('同步失败: ' + (err.message || '未知错误'));
  } finally {
    refreshingModelsMap.value[channel.id] = false;
  }
}

async function onChannelChange(channelId: string) {
  availableUpstreamModels.value = [];
  if (!channelId) return;
  
  const selectedCh = channels.value.find(c => c.id === channelId);
  if (!selectedCh) return;
  
  if (selectedCh.models && selectedCh.models.length > 0 && !selectedCh.models.includes('*')) {
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
    console.warn('Failed to discover upstream models: ', err);
  } finally {
    loadingUpstreamModels.value = false;
  }
}

async function saveChannel() {
  if (!channelForm.value.name.trim() || !channelForm.value.baseUrl.trim()) {
    ElMessage.warning('请填写必填项');
    return;
  }
  const payload: any = { name: channelForm.value.name.trim(), baseUrl: channelForm.value.baseUrl.trim(), type: channelForm.value.type, weight: channelForm.value.weight, status: channelForm.value.status, notes: channelForm.value.notes, models: channelForm.value.modelsRaw.split(',').map((s) => s.trim()).filter(Boolean) };
  if (channelForm.value.apiKey.trim()) payload.apiKey = channelForm.value.apiKey.trim();
  try {
    if (editingChannelId.value) await updateChannel(editingChannelId.value, payload); else await createChannel(payload);
    ElMessage.success('渠道已保存');
    channelModalOpen.value = false;
    await loadChannels();
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.message || '未知错误'));
  }
}

async function saveMapping() {
  if (!mappingForm.value.id.trim() || !mappingForm.value.label.trim() || !mappingForm.value.channelId.trim() || !mappingForm.value.upstreamModel.trim()) {
    ElMessage.warning('请填写必填项');
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
  try {
    const current = [...mappings.value.filter((item) => item.id !== editingMappingId.value), next];
    mappings.value = current;
    await updateModelConfig({ mappings: current });
    ElMessage.success('模型映射已保存');
    mappingModalOpen.value = false;
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.message || '未知错误'));
  }
}

async function beforeIconUpload(file: File) {
  try {
    const res = await uploadImage(file);
    if (res && res.url) {
      mappingForm.value.iconUrl = res.url;
      ElMessage.success('图片上传成功');
    } else {
      ElMessage.error('图片上传失败：接口未返回 URL');
    }
  } catch (err: any) {
    console.error(err);
    ElMessage.error('图片上传失败：' + (err.message || '未知错误'));
  }
  return false;
}

async function toggleStatus(channel: Channel) {
  if (togglingMap.value[channel.id]) return;
  togglingMap.value[channel.id] = true;
  try {
    await updateChannel(channel.id, { status: !channel.status });
    channel.status = !channel.status;
    ElMessage.success(channel.status ? '渠道已启用' : '渠道已禁用');
  } catch (err: any) {
    ElMessage.error('切换状态失败：' + (err.message || '未知错误'));
  } finally {
    togglingMap.value[channel.id] = false;
  }
}

async function toggleMappingEnabled(item: ModelMapping) {
  if (mappingToggling.value[item.id]) return;
  mappingToggling.value[item.id] = true;
  try {
    item.enabled = !item.enabled;
    await updateModelConfig({ mappings: mappings.value });
    ElMessage.success(item.enabled ? '映射已启用' : '映射已禁用');
  } catch (err: any) {
    item.enabled = !item.enabled;
    ElMessage.error('切换状态失败：' + (err.message || '未知错误'));
  } finally {
    mappingToggling.value[item.id] = false;
  }
}

async function testConnection(id: string) {
  testingMap.value[id] = true;
  try {
    const result = await testChannelConnection(id);
    pingResults.value[id] = { success: result.success, latency: result.latency, error: result.error };
    if (result.success) {
      ElMessage.success(`连接成功 (${result.latency}ms)`);
    } else {
      ElMessage.error(`连接失败: ${result.error || '未知错误'}`);
    }
  } catch (err: any) {
    pingResults.value[id] = { success: false, error: err.message };
    ElMessage.error(`连接出错: ${err.message || '未知错误'}`);
  } finally {
    testingMap.value[id] = false;
  }
}

function confirmDeleteChannel(channel: Channel) {
  deleteChannel(channel.id)
    .then(() => {
      ElMessage.success('渠道已删除');
      void loadChannels();
    })
    .catch((err) => {
      ElMessage.error('删除失败: ' + (err.message || '未知错误'));
    });
}

function confirmDeleteMapping(item: ModelMapping) {
  const nextMappings = mappings.value.filter((m) => m.id !== item.id);
  updateModelConfig({ mappings: nextMappings })
    .then(() => {
      mappings.value = nextMappings;
      ElMessage.success('模型映射已删除');
    })
    .catch((err) => {
      ElMessage.error('删除失败: ' + (err.message || '未知错误'));
    });
}

// Diagnostics Sandbox execution
async function runSandboxTest() {
  if (!sandboxModel.value) {
    ElMessage.warning('请选择一个模型进行测试');
    return;
  }
  
  const mapping = mappings.value.find(m => m.id === sandboxModel.value);
  const purpose = mapping ? mapping.purpose : 'chat';
  
  sandboxTesting.value = true;
  sandboxResultType.value = purpose;
  sandboxChatResponse.value = '';
  sandboxImageUrl.value = '';
  sandboxVideoUrl.value = '';
  sandboxRoutingInfo.value = null;
  sandboxRawJson.value = null;
  sandboxProgressText.value = '正在寻路路由并发送请求...';

  const startTime = Date.now();
  
  let expectedChannelName = '默认环境变量';
  let expectedUpstreamModel = sandboxModel.value;
  if (mapping) {
    const ch = channels.value.find(c => c.id === mapping.channelId);
    if (ch) expectedChannelName = ch.name;
    expectedUpstreamModel = mapping.upstreamModel;
  } else {
    const activeChs = channels.value.filter(c => c.status && (c.type === 'all' || c.type === purpose) && (c.models.includes('*') || c.models.includes(sandboxModel.value)));
    if (activeChs[0]) expectedChannelName = activeChs[0].name;
  }

  try {
    if (purpose === 'chat') {
      const payload = {
        model: sandboxModel.value,
        messages: [{ role: 'user', content: sandboxPrompt.value }],
        temperature: sandboxTemperature.value,
        maxTokens: sandboxMaxTokens.value
      };
      const res = await testChat(payload);
      const latency = Date.now() - startTime;
      
      sandboxChatResponse.value = res.message?.content || '（未返回文本内容）';
      sandboxRawJson.value = res;
      sandboxRoutingInfo.value = {
        channelName: expectedChannelName,
        upstreamModel: expectedUpstreamModel,
        latency
      };
    } else if (purpose === 'image') {
      const payload = {
        model: sandboxModel.value,
        prompt: sandboxPrompt.value,
        size: sandboxSize.value,
        quality: sandboxQuality.value,
        aspectRatio: sandboxAspectRatio.value
      };
      const initRes = await testGenerateImage(payload);
      sandboxRawJson.value = initRes;
      
      if (initRes.taskId) {
        sandboxProgressText.value = '图像生成任务已提交，后台排队处理中...';
        await pollGenerationTask(initRes.taskId, 'image', startTime, expectedChannelName, expectedUpstreamModel);
      } else {
        throw new Error('未返回任务 ID');
      }
    } else if (purpose === 'video') {
      const payload = {
        model: sandboxModel.value,
        prompt: sandboxPrompt.value
      };
      const initRes = await testGenerateVideo(payload);
      sandboxRawJson.value = initRes;
      
      if (initRes.taskId) {
        sandboxProgressText.value = '视频生成任务已提交，后台渲染中...';
        await pollGenerationTask(initRes.taskId, 'video', startTime, expectedChannelName, expectedUpstreamModel);
      } else {
        throw new Error('未返回任务 ID');
      }
    }
  } catch (err: any) {
    console.error(err);
    ElMessage.error('测试请求失败: ' + (err.response?.data?.error || err.message || '未知错误'));
    sandboxRawJson.value = err.response?.data || { error: err.message };
    sandboxTesting.value = false;
  }
}

async function pollGenerationTask(taskId: string, type: 'image' | 'video', startTime: number, channelName: string, upstreamModel: string) {
  let attempts = 0;
  const maxAttempts = 60;
  
  const timer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(timer);
      ElMessage.error('测试任务超时');
      sandboxTesting.value = false;
      return;
    }
    
    try {
      const res = await pollTaskStatus(taskId);
      sandboxRawJson.value = res;
      
      if (res.status === 'success') {
        clearInterval(timer);
        const latency = Date.now() - startTime;
        if (type === 'image') {
          sandboxImageUrl.value = res.imageUrl || '';
        } else {
          sandboxVideoUrl.value = res.videoUrl || '';
        }
        sandboxRoutingInfo.value = {
          channelName,
          upstreamModel,
          latency
        };
        sandboxTesting.value = false;
        ElMessage.success('生成测试成功！');
      } else if (res.status === 'error') {
        clearInterval(timer);
        sandboxTesting.value = false;
        ElMessage.error('生成测试失败: ' + (res.error || '未知错误'));
      } else {
        sandboxProgressText.value = `生成任务处理中（已耗时 ${Math.round((Date.now() - startTime) / 1000)} 秒）...`;
      }
    } catch (err: any) {
      console.warn('Polling task status failed: ', err);
    }
  }, 2000);
}

onMounted(() => {
  void loadChannels();
  void loadMappings();
});
</script>

<style scoped lang="scss">
.admin-dashboard-layout {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  
  :deep(.el-table) {
    --el-table-bg-color: #141416;
    --el-table-tr-bg-color: #141416;
    --el-table-header-bg-color: #1a1a1e;
    --el-table-border-color: #27272a;
    --el-table-header-text-color: #a1a1aa;
    --el-table-text-color: #e4e4e7;
    background-color: #141416;
    border-radius: 8px;
    overflow: hidden;
  }

  :deep(.el-table__row:hover > td) {
    background-color: #1d1d22 !important;
  }

  :deep(.el-dialog) {
    --el-dialog-bg-color: #141416;
    --el-dialog-title-font-size: 16px;
    --el-dialog-title-text-color: #fff;
    --el-dialog-content-font-size: 14px;
    border: 1px solid #27272a;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  :deep(.el-form-item__label) {
    color: #a1a1aa !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding-bottom: 4px !important;
  }

  :deep(.el-input__inner), :deep(.el-textarea__inner) {
    font-family: inherit;
  }

  :deep(.el-input-number .el-input__inner) {
    text-align: left;
  }
}

.channel-avatar {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f97316, #8b5cf6);
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.status-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse 1.6s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}
</style>
