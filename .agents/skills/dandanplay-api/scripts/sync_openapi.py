#!/usr/bin/env python3
"""Fetch the official dandanplay OpenAPI document and rebuild local references."""

from __future__ import annotations

import datetime as dt
import json
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

OPENAPI_URL = "https://api.dandanplay.net/swagger/v2/swagger.json"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "references"


def fetch_document() -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAPI_URL,
        headers={"User-Agent": "Marchen-Player-dandanplay-api-skill/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def schema_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def schema_label(schema: Any) -> str:
    if not isinstance(schema, dict):
        return "unknown"
    if "$ref" in schema:
        return schema_name(schema["$ref"])
    if "allOf" in schema:
        return " & ".join(schema_label(item) for item in schema["allOf"])
    if "oneOf" in schema:
        return "oneOf<" + " | ".join(schema_label(item) for item in schema["oneOf"]) + ">"
    if "anyOf" in schema:
        return "anyOf<" + " | ".join(schema_label(item) for item in schema["anyOf"]) + ">"
    data_type = schema.get("type")
    if data_type == "array":
        return f"array<{schema_label(schema.get('items', {}))}>"
    if not data_type and "properties" in schema:
        data_type = "object"
    label = data_type or "unknown"
    if schema.get("format"):
        label += f"({schema['format']})"
    if schema.get("nullable"):
        label += " | null"
    return label


def clean(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("|", "\\|").split())


def detail_bits(schema: dict[str, Any]) -> list[str]:
    bits: list[str] = []
    if "default" in schema:
        bits.append(f"默认 `{json.dumps(schema['default'], ensure_ascii=False)}`")
    if "enum" in schema:
        values = ", ".join(f"`{item}`" for item in schema["enum"])
        bits.append(f"枚举 {values}")
    for key, label in (
        ("minimum", "最小"),
        ("maximum", "最大"),
        ("minLength", "最短"),
        ("maxLength", "最长"),
        ("minItems", "最少项"),
        ("maxItems", "最多项"),
        ("pattern", "正则"),
    ):
        if key in schema:
            bits.append(f"{label} `{schema[key]}`")
    if schema.get("readOnly"):
        bits.append("只读")
    if schema.get("writeOnly"):
        bits.append("只写")
    return bits


def security_label(security: Any, inherited: Any) -> str:
    effective = inherited if security is None else security
    if effective == []:
        return "OpenAPI 标记为无用户鉴权；应用身份仍以接入指南为准"
    names: list[str] = []
    for item in effective or []:
        names.extend(item.keys())
    return ", ".join(dict.fromkeys(names)) or "未声明；以接入指南为准"


def operation_count(document: dict[str, Any]) -> int:
    return sum(
        1
        for path_item in document.get("paths", {}).values()
        for method in path_item
        if method.lower() in HTTP_METHODS
    )


def expanded_properties(
    schema: dict[str, Any],
    schemas: dict[str, Any],
    seen: set[str] | None = None,
) -> tuple[dict[str, Any], set[str]]:
    """Collect properties and required fields through refs and allOf branches."""
    seen = set() if seen is None else set(seen)
    properties: dict[str, Any] = {}
    required = set(schema.get("required", []))

    ref = schema.get("$ref")
    if ref:
        name = schema_name(ref)
        if name in seen:
            return properties, required
        target = schemas.get(name)
        if target:
            nested_properties, nested_required = expanded_properties(
                target,
                schemas,
                seen | {name},
            )
            properties.update(nested_properties)
            required.update(nested_required)

    for branch in schema.get("allOf", []):
        nested_properties, nested_required = expanded_properties(branch, schemas, seen)
        properties.update(nested_properties)
        required.update(nested_required)

    properties.update(schema.get("properties", {}))
    return properties, required


def render_api_reference(document: dict[str, Any], fetched_at: str) -> str:
    grouped: dict[str, list[tuple[str, str, dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for path, path_item in document.get("paths", {}).items():
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            tag = (operation.get("tags") or ["未分组"])[0]
            grouped[tag].append((path, method.upper(), operation, path_item))

    lines = [
        "# 弹弹play API v2 全部接口",
        "",
        f"> 官方 OpenAPI：<{OPENAPI_URL}>  ",
        f"> 快照时间：{fetched_at}；OpenAPI `{document.get('openapi', 'unknown')}`；"
        f"{len(document.get('paths', {}))} 个路径，{operation_count(document)} 个操作。",
        "",
        "按标签、HTTP 方法、完整路径、摘要或 `operationId` 搜索。模型名在 `schemas.md` 中展开。",
        "",
        "## 接口总览",
        "",
        "| 分组 | 方法 | 路径 | 摘要 |",
        "|---|---|---|---|",
    ]
    tag_order = [item.get("name") for item in document.get("tags", [])]
    for tag in tag_order + sorted(set(grouped) - set(tag_order)):
        for path, method, operation, _ in grouped.get(tag, []):
            lines.append(f"| {clean(tag)} | `{method}` | `{path}` | {clean(operation.get('summary'))} |")

    inherited_security = document.get("security")
    for tag in tag_order + sorted(set(grouped) - set(tag_order)):
        operations = grouped.get(tag, [])
        if not operations:
            continue
        lines.extend(["", f"## {tag}"])
        for path, method, operation, path_item in operations:
            lines.extend(
                [
                    "",
                    f"### `{method} {path}`",
                    "",
                    f"- 摘要：{operation.get('summary') or '未提供'}",
                    f"- `operationId`：`{operation.get('operationId', '未提供')}`",
                    f"- OpenAPI 安全声明：{security_label(operation.get('security'), inherited_security)}",
                ]
            )
            if operation.get("description"):
                lines.extend(["", clean(operation["description"])])

            parameters = list(path_item.get("parameters", [])) + list(operation.get("parameters", []))
            if parameters:
                lines.extend(
                    [
                        "",
                        "参数：",
                        "",
                        "| 名称 | 位置 | 必填 | 类型 | 说明与约束 |",
                        "|---|---|---:|---|---|",
                    ]
                )
                for parameter in parameters:
                    schema = parameter.get("schema", {})
                    details = [parameter.get("description", ""), *detail_bits(schema)]
                    lines.append(
                        f"| `{parameter.get('name', '')}` | {parameter.get('in', '')} | "
                        f"{'是' if parameter.get('required') else '否'} | `{schema_label(schema)}` | "
                        f"{clean('；'.join(item for item in details if item))} |"
                    )
            else:
                lines.extend(["", "参数：无。"])

            request_body = operation.get("requestBody")
            if request_body:
                lines.extend(["", f"请求体（{'必填' if request_body.get('required') else '可选'}）：", ""])
                for media_type, media in request_body.get("content", {}).items():
                    lines.append(f"- `{media_type}`：`{schema_label(media.get('schema', {}))}`")

            responses = operation.get("responses", {})
            lines.extend(["", "响应：", "", "| 状态 | 说明 | 内容类型与模型 |", "|---|---|---|"])
            for status, response in responses.items():
                contents = []
                for media_type, media in response.get("content", {}).items():
                    contents.append(f"`{media_type}` → `{schema_label(media.get('schema', {}))}`")
                lines.append(
                    f"| `{status}` | {clean(response.get('description'))} | {clean('；'.join(contents)) or '未声明'} |"
                )

    return "\n".join(lines) + "\n"


def render_schemas(document: dict[str, Any], fetched_at: str) -> str:
    schemas = document.get("components", {}).get("schemas", {})
    lines = [
        "# 弹弹play API v2 数据模型",
        "",
        f"> 来源：<{OPENAPI_URL}>；快照时间：{fetched_at}；共 {len(schemas)} 个 schema。",
        "",
        "按模型名或字段名搜索。复杂组合关系需要精确生成类型时，以 `openapi.json` 为准。",
    ]
    for name, schema in schemas.items():
        lines.extend(["", f"## {name}", "", f"- 类型：`{schema_label(schema)}`"])
        if schema.get("description"):
            lines.append(f"- 说明：{clean(schema['description'])}")
        if schema.get("enum"):
            lines.append("- 枚举：" + ", ".join(f"`{item}`" for item in schema["enum"]))
        if schema.get("allOf"):
            lines.append("- 组合：" + " & ".join(f"`{schema_label(item)}`" for item in schema["allOf"]))
        if schema.get("oneOf"):
            lines.append("- oneOf：" + " | ".join(f"`{schema_label(item)}`" for item in schema["oneOf"]))
        properties, required = expanded_properties(schema, schemas, {name})
        if properties:
            lines.extend(
                [
                    "",
                    "| 字段 | 必填 | 类型 | 说明与约束 |",
                    "|---|---:|---|---|",
                ]
            )
            for field, field_schema in properties.items():
                details = [field_schema.get("description", ""), *detail_bits(field_schema)]
                lines.append(
                    f"| `{field}` | {'是' if field in required else '否'} | `{schema_label(field_schema)}` | "
                    f"{clean('；'.join(item for item in details if item))} |"
                )
        additional = schema.get("additionalProperties")
        if additional:
            lines.append(f"- 额外属性：`{schema_label(additional)}`")
    return "\n".join(lines) + "\n"


def main() -> None:
    document = fetch_document()
    if document.get("openapi") != "3.0.0":
        raise RuntimeError(f"Unexpected OpenAPI version: {document.get('openapi')!r}")
    if not document.get("paths") or not document.get("components", {}).get("schemas"):
        raise RuntimeError("OpenAPI document is missing paths or schemas")

    fetched_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    REFERENCES.mkdir(parents=True, exist_ok=True)
    (REFERENCES / "openapi.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (REFERENCES / "api-reference.md").write_text(
        render_api_reference(document, fetched_at),
        encoding="utf-8",
    )
    (REFERENCES / "schemas.md").write_text(
        render_schemas(document, fetched_at),
        encoding="utf-8",
    )
    print(
        f"Synced OpenAPI {document['openapi']}: "
        f"{len(document['paths'])} paths, {operation_count(document)} operations, "
        f"{len(document['components']['schemas'])} schemas"
    )


if __name__ == "__main__":
    main()
