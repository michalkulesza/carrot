# Extraction V2 flow

This diagram shows the production source-aware boundary for recipe extraction v2.
`ExtractionOrchestrator` owns platform-specific retrieval and evidence selection;
`ExtractorV2` receives only source-agnostic, normalized evidence. URL and
pasted-text imports use this path; image imports retain Gemini vision for source
reading and use the shared enrichment and persistence contracts.

```mermaid
flowchart TD
    input[Recipe URL, pasted text, or captured fixture]

    subgraph sources[Source acquisition]
        social[Instagram or TikTok URL]
        html[Website URL or raw HTML fixture]
        scrape[ScrapeCreators]
        socialPayload[Versioned social payload<br/>raw ScrapeCreators response, comments, audio/transcript]
        rawHtml[Versioned HTML payload<br/>raw page HTML]

        social --> scrape --> socialPayload
        html --> rawHtml
        input --> social
        input --> html
    end

    subgraph orchestrator[ExtractionOrchestrator - source-aware]
        adapter[Reuse ScrapeCreators response parser<br/>caption, creator, thumbnail, video URL, linked URLs]
        authorship[Verify creator authorship<br/>include only creator comments/replies]
        evidence[Order and select evidence<br/>caption, then verified creator content, linked page, transcript]
        fetchLinked[Fetch linked recipe page]
        cleaner[HTML cleaner<br/>remove page chrome; retain recipe structure]
        normalize[Normalize selected text<br/>and retain provenance]
        completeness{Complete recipe?}
        merge[Apply eligible fallback / merge<br/>and preserve conflict evidence]

        socialPayload --> adapter --> authorship --> evidence
        rawHtml --> cleaner
        evidence -->|linked URL selected| fetchLinked --> cleaner
        evidence -->|caption, verified creator text, transcript| normalize
        cleaner -->|cleaned body HTML| v2html
        normalize -->|normalized plain text| v2text
    end

    subgraph extractor[ExtractorV2 - source-agnostic]
        v2html[cleaned HTML entry point]
        v2text[normalized text entry point]
        extract[Extract recipe facts<br/>ingredients, steps, missing-content / failure codes]
        v2html --> extract
        v2text --> extract
    end

    extract --> completeness
    completeness -->|complete or usable partial| enrich[Enrichment and persistence]
    completeness -->|needs eligible fallback| merge --> evidence
    completeness -->|no usable evidence remains| failure[Structured extraction failure]
    style orchestrator fill:#fff5e8,stroke:#e67e22,color:#3d2b1f
    style extractor fill:#edf7ed,stroke:#2e7d32,color:#163d1b
```

Key boundary: the orchestrator may know that evidence came from a caption,
creator-authored comment, linked page, or transcript. `ExtractorV2` must not;
it accepts only cleaned HTML or normalized text plus the associated evidence
provenance needed for traceability.
