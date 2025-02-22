"use strict";
const common_vendor = require("../../common/vendor.js");
const CACHE_KEY = "OFFLINE_CACHE";
const MAX_RETRY = 3;
const _sfc_main = {
  data() {
    return {
      formData: {
        title: "",
        file: null,
        tempFilePath: ""
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
      common_vendor.index.onNetworkStatusChange((res) => {
        console.log("网络", res);
        this.networkStatus = res.isConnected;
        if (res.isConnected) {
          this.processCacheQueue();
        }
      });
      common_vendor.index.getNetworkType({
        success: (res) => {
          console.log("res", res);
          this.networkStatus = res.networkType !== "none";
        }
      });
    },
    // 选择文件
    // uniapp平台提供的方法只兼容app和H5，所以微信小程序使用该方法，唤起微信聊天框选择文件
    async chooseFile() {
      try {
        common_vendor.wx$1.chooseMessageFile({
          count: 1,
          //默认1
          type: "all",
          success: async (res) => {
            const files = res.tempFiles;
            console.log("files", files);
            this.formData.file = files[0];
            this.formData.tempFilePath = await this.saveFile(files[0].path);
          },
          fail: (err) => {
            throw err;
          }
        });
      } catch (error) {
        common_vendor.index.showToast({
          title: "文件选择失败",
          icon: "none"
        });
      }
    },
    // 具体的上传模拟接口
    // 
    uploadFilePromise(filePath) {
      return new Promise((resolve, reject) => {
        common_vendor.index.uploadFile({
          url: `${process.env.VUE_APP_BACK_URL}/nqi/file/uploadTopfs`,
          filePath,
          name: "file",
          header: {
            "top-token": common_vendor.index.getStorageSync("top-token")
          },
          success: (res) => {
            resolve(res.data);
          },
          fail: (err) => {
            reject(err);
          }
        });
      });
    },
    // 删除本地小程序缓存信息？
    async deleCacheFile() {
    },
    // 保存文件到持久化存储
    async saveFile(tempPath) {
      try {
        const saveRes = await common_vendor.index.saveFile({
          tempFilePath: tempPath
        });
        return saveRes.savedFilePath;
      } catch (e) {
        console.error("文件保存失败:", e);
        return null;
      }
    },
    // 处理提交
    async handleSubmit() {
      if (!this.formData.title || !this.formData.file) {
        common_vendor.index.showToast({
          title: "请填写完整内容",
          icon: "none"
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
          common_vendor.index.showToast({
            title: "上传成功",
            icon: "success"
          });
          this.formData.file = null;
          this.formData.title = "";
          this.formData.tempFilePath = "";
        }
      } else {
        this.addToCache(payload);
        common_vendor.index.showToast({
          title: "已离线保存",
          icon: "success"
        });
      }
    },
    // 添加到缓存队列
    addToCache(data) {
      let cache = common_vendor.index.getStorageSync(CACHE_KEY) || [];
      if (cache.length >= 50)
        cache.shift();
      cache.push(data);
      common_vendor.index.setStorageSync(CACHE_KEY, cache);
    },
    // 处理缓存队列
    async processCacheQueue() {
      let cache = common_vendor.index.getStorageSync(CACHE_KEY) || [];
      while (cache.length > 0) {
        const item = cache[0];
        try {
          await this.uploadData(item);
          cache.shift();
          common_vendor.index.setStorageSync(CACHE_KEY, cache);
        } catch (error) {
          if (item.retryCount < MAX_RETRY) {
            item.retryCount++;
            common_vendor.index.setStorageSync(CACHE_KEY, cache);
          } else {
            cache.shift();
            common_vendor.index.setStorageSync(CACHE_KEY, cache);
          }
          break;
        }
      }
      if (cache.length == 0) {
        common_vendor.index.showToast({
          title: "本地缓存数据已全部上传成功",
          icon: "none"
        });
        this.formData.file = null;
        this.formData.title = "";
        this.formData.tempFilePath = "";
      }
    },
    // 数据上传（这里模拟上传就是成功）
    async uploadData(data) {
      console.log("data", data);
      try {
        return new Promise((res, ret) => {
          res(true);
        });
        return;
        if (data.tempFilePath) {
          await common_vendor.index.uploadFile({
            url: "https://api.example.com/upload",
            filePath: data.tempFilePath,
            name: "file",
            formData: {
              title: data.title
            }
          });
        }
        await common_vendor.index.request({
          url: "https://api.example.com/submit",
          method: "POST",
          data: {
            title: data.title,
            timestamp: data.timestamp
          }
        });
        common_vendor.index.showToast({
          title: "提交成功"
        });
      } catch (error) {
        throw new Error("上传失败");
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
      const cache = common_vendor.index.getStorageSync(CACHE_KEY);
      if (cache && cache.length > 0) {
        common_vendor.index.showModal({
          title: "待同步数据",
          content: `检测到 ${cache.length} 条未同步记录`,
          confirmText: "立即同步",
          success: (res) => {
            if (res.confirm && this.networkStatus) {
              this.processCacheQueue();
            }
            if (!this.networkStatus) {
              common_vendor.index.showToast({
                title: "网络仍然未连接"
              });
            }
          }
        });
      }
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  var _a, _b, _c, _d;
  return common_vendor.e({
    a: $data.formData.title,
    b: common_vendor.o(($event) => $data.formData.title = $event.detail.value),
    c: common_vendor.t($data.formData.file ? "已选择文件" : "点击上传附件"),
    d: common_vendor.o((...args) => $options.chooseFile && $options.chooseFile(...args)),
    e: $data.formData.file && $data.formData.tempFilePath
  }, $data.formData.file && $data.formData.tempFilePath ? {
    f: common_vendor.t("重置选择文件"),
    g: common_vendor.o(() => {
      $data.formData.file = null;
      $data.formData.tempFilePath = "";
    })
  } : {}, {
    h: $data.formData.file
  }, $data.formData.file ? {
    i: common_vendor.t((_a = $data.formData.file) == null ? void 0 : _a.name),
    j: common_vendor.t((_b = $data.formData.file) == null ? void 0 : _b.path),
    k: common_vendor.t((_c = $data.formData.file) == null ? void 0 : _c.size),
    l: common_vendor.t((_d = $data.formData.file) == null ? void 0 : _d.type)
  } : {}, {
    m: common_vendor.t($data.networkStatus ? "立即提交" : "离线保存"),
    n: common_vendor.o((...args) => $options.handleSubmit && $options.handleSubmit(...args)),
    o: !$data.formData.title,
    p: !$data.networkStatus
  }, !$data.networkStatus ? {} : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render]]);
wx.createPage(MiniProgramPage);
