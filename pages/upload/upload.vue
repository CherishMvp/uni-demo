<template>
	<view class="container">
		<!-- 标题输入 -->
		<!-- @input="autoSaveDraft" 暂时不考虑自动输入 -->
		<input v-model="formData.title" placeholder="请输入标题" class="input" />
		<div style="display: flex;justify-content:space-between;">
			<!-- 文件上传 -->
			<button @click="chooseFile" class="upload-btn">
				{{ formData.file ? '已选择文件' : '点击上传附件' }}
			</button>
			<!-- 删除文件 -->
			<button v-if="formData.file&&formData.tempFilePath"
				@click="()=>{formData.file=null;formData.tempFilePath=''}" class="upload-btn">
				{{ '重置选择文件' }}
			</button>
		</div>
		<!-- 展示文件信息 -->
		<div v-if="formData.file" class="desc" style="display: flex;flex-direction: column;padding: 6px 6px;">
			<span>文件名：{{formData.file?.name}}</span>
			<span>文件路径：{{formData.file?.path}}</span>
			<span>大小：{{formData.file?.size}} </span>
			<span>类型：{{formData.file?.type}}</span>
		</div>
		<!-- 提交按钮 -->
		<button @click="handleSubmit" :disabled="!formData.title" class="submit-btn">
			{{ networkStatus ? '立即提交' : '离线保存' }}
		</button>

		<!-- 由于平台限制，当前在微信小程序中只支持通过聊天界面选择文件 -->
		<view class="network-alert">
			⚠️ 由于平台限制，当前在微信小程序中只支持通过聊天界面选择文件
		</view>
		<!-- 网络状态提示 -->
		<view v-if="!networkStatus" class="network-alert">
			⚠️ 当前处于离线状态，点击离线按钮本地保存
		</view>
	</view>
</template>

<script>
	const CACHE_KEY = 'OFFLINE_CACHE';
	const MAX_RETRY = 3;

	export default {
		data() {
			return {
				formData: {
					title: '',
					file: null,
					tempFilePath: ''
				},
				networkStatus: true,
				cacheQueue: []
			};
		},
		onShow() {
			this.initNetworkListener();
			this.loadCachedData();
		},
		onLoad() {

		},
		methods: {
			// 初始化网络监听
			initNetworkListener() {
				uni.onNetworkStatusChange((res) => {
					console.log("网络", res)
					this.networkStatus = res.isConnected;
					if (res.isConnected) {
						this.processCacheQueue();
					}
				});

				uni.getNetworkType({
					success: (res) => {
						console.log("res", res)
						this.networkStatus = res.networkType !== 'none';
					}
				});
			},

			// 选择文件
			// uniapp平台提供的方法只兼容app和H5，所以微信小程序使用该方法，唤起微信聊天框选择文件
			async chooseFile() {
				try {
					wx.chooseMessageFile({
						count: 1, //默认1
						type: 'all',
						success: async (res) => {
							const files = res.tempFiles;
							console.log("files", files)
							this.formData.file = files[0];
							this.formData.tempFilePath = await this.saveFile(files[0].path);
							// this.$emit('handleUploadFile', files);
						},
						fail: (err) => {
							// 用户取消选择文件或选择文件失败的回调函数
							throw err;
						},
					});


				} catch (error) {
					uni.showToast({
						title: '文件选择失败',
						icon: 'none'
					});
				}
			},

			// 具体的上传模拟接口
			// 
			uploadFilePromise(filePath) {
				return new Promise((resolve, reject) => {
					uni.uploadFile({
						// #ifndef H5
						url: `${process.env.VUE_APP_BACK_URL}/nqi/file/uploadTopfs`,
						// #endif
						// #ifdef H5
						url: `${process.env.VUE_APP_BASE_URL}/nqi/file/uploadTopfs`,
						// #endif
						filePath: filePath,
						name: 'file',
						header: {
							'top-token': uni.getStorageSync('top-token'),
						},
						success: (res) => {
							resolve(res.data);
						},
						fail: (err) => {
							reject(err);
						},
					});
				});
			},

			// 删除本地小程序缓存信息？
			async deleCacheFile() {},
			// 保存文件到持久化存储
			async saveFile(tempPath) {
				try {
					const saveRes = await uni.saveFile({
						tempFilePath: tempPath
					});
					return saveRes.savedFilePath;
				} catch (e) {
					console.error('文件保存失败:', e);
					return null;
				}
			},

			// 处理提交
			async handleSubmit() {
				if (!this.formData.title || !this.formData.file) {
					uni.showToast({
						title: '请填写完整内容',
						icon: 'none'
					});
					return;
				}

				const payload = {
					...this.formData,
					timestamp: Date.now(),
					retryCount: 0
				};

				if (this.networkStatus) {
					const uploadState = await this.uploadData(payload);
					if (uploadState) {
						uni.showToast({
							title: '上传成功',
							icon: 'success'
						});
						this.formData.file = null;
						this.formData.title = '';
						this.formData.tempFilePath = '';
					}
				} else {
					this.addToCache(payload);
					uni.showToast({
						title: '已离线保存',
						icon: 'success'
					});
				}
			},

			// 添加到缓存队列
			addToCache(data) {
				let cache = uni.getStorageSync(CACHE_KEY) || [];
				if (cache.length >= 50) cache.shift(); // 限制最大缓存
				cache.push(data);
				uni.setStorageSync(CACHE_KEY, cache);
			},

			// 处理缓存队列
			async processCacheQueue() {
				let cache = uni.getStorageSync(CACHE_KEY) || [];
				while (cache.length > 0) {
					const item = cache[0];
					try {
						await this.uploadData(item);
						cache.shift();
						uni.setStorageSync(CACHE_KEY, cache);
					} catch (error) {
						if (item.retryCount < MAX_RETRY) {
							item.retryCount++;
							uni.setStorageSync(CACHE_KEY, cache);
						} else {
							cache.shift();
							uni.setStorageSync(CACHE_KEY, cache);
						}
						break;
					}
				}
				if (cache.length == 0) {
					uni.showToast({
						title: "本地缓存数据已全部上传成功",
						icon: 'none'
					})
					this.formData.file = null;
					this.formData.title = '';
					this.formData.tempFilePath = '';
				}
			},

			// 数据上传（这里模拟上传就是成功）
			async uploadData(data) {
				console.log("data", data)
				try {
					// mock upload file success
					return new Promise((res, ret) => {
						res(true); //模拟上传成功
					})
					return;
					// 上传文件
					if (data.tempFilePath) {
						// 具体接口模拟上传文件
						await uni.uploadFile({
							url: 'https://api.example.com/upload',
							filePath: data.tempFilePath,
							name: 'file',
							formData: {
								title: data.title
							}
						});
					}

					// 提交表单数据
					// 具体提交表单数据
					await uni.request({
						url: 'https://api.example.com/submit',
						method: 'POST',
						data: {
							title: data.title,
							timestamp: data.timestamp
						}
					});

					uni.showToast({
						title: '提交成功'
					});
				} catch (error) {
					throw new Error('上传失败');
				}
			},

			// 自动保存草稿(是否考虑加入自动输入有待考虑)
			autoSaveDraft() {
				if (!this.networkStatus) {
					this.addToCache(this.formData);
				}
			},

			// 加载缓存数据
			loadCachedData() {
				const cache = uni.getStorageSync(CACHE_KEY);
				if (cache && cache.length > 0) {
					uni.showModal({
						title: '待同步数据',
						content: `检测到 ${cache.length} 条未同步记录`,
						confirmText: '立即同步',
						success: res => {
							if (res.confirm && this.networkStatus) {
								this.processCacheQueue();
							}
							if (!this.networkStatus) {
								uni.showToast({
									title: "网络仍然未连接"
								})
							}
						}
					});
				}
			}
		}
	};
</script>

<style>
	.container {
		padding: 20px;
	}

	.input {
		border: 1px solid #eee;
		padding: 10px;
		margin-bottom: 15px;
	}

	.upload-btn {
		background-color: #f0f0f0;
		margin-bottom: 15px;
	}

	.submit-btn {
		background-color: #007aff;
		color: white;
	}

	.network-alert {
		color: #ff3b30;
		margin-top: 15px;
		font-size: 16px;
	}
</style>