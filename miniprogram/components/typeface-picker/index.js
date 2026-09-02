// components/typeface-picker/index.js —— Aa 字体选择按钮 + 底部选择面板
const typeface = require('../../utils/typeface.js')

Component({
  data: {
    fonts: typeface.FONTS,
    curId: '',
    open: false
  },
  lifetimes: {
    attached() {
      const id = typeface.currentId()
      this.setData({ curId: id })
      // 上抛当前字体，宿主可立即用于 style
      this.triggerEvent('change', { stack: typeface.stackOf(id) })
    }
  },
  methods: {
    open() { this.setData({ open: true }) },
    close() { this.setData({ open: false }) },
    noop() {},
    pick(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      typeface.saveById(id)
      this.setData({ curId: id, open: false })
      this.triggerEvent('change', { stack: typeface.stackOf(id) })
    }
  }
})
