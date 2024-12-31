import { Button } from "@renderer/components/ui/button"
import { memo } from "react"

export const ImportDanmakuFromXML = memo(() => {
  return (
    <Button variant="secondary" onClick={() => {}}>
      <i className="icon-[mingcute--file-new-line] mr-1 text-lg" />
      <span>通过 XML 导入</span>
    </Button>
  )
})
