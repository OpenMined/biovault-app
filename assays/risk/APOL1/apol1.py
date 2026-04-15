G1_SITE_1 = bioscript.variant(
    rsid="rs73885319",
    grch37="22:36661906-36661906",
    grch38="22:36265860-36265860",
    ref="A",
    alt="G",
    kind="snp",
)

G1_SITE_2 = bioscript.variant(
    rsid="rs60910145",
    grch37="22:36662034-36662034",
    grch38="22:36265988-36265988",
    ref="T",
    alt="G",
    kind="snp",
)

G2_SITE = bioscript.variant(
    rsid=["rs71785313", "rs1317778148", "rs143830837"],
    grch37="22:36662046-36662051",
    grch38="22:36266000-36266005",
    ref="I",
    alt="D",
    kind="deletion",
    deletion_length=6,
    motifs=["TTATAA", "ATAATT"],
)

APOL1_QUERY_PLAN = bioscript.query_plan([
    G1_SITE_1,
    G1_SITE_2,
    G2_SITE,
])


def count_char(text, needle):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch == needle:
            total = total + 1
    return total


def count_non_ref(text, ref):
    if text is None:
        return 0
    total = 0
    for ch in text:
        if ch != ref and ch != "-":
            total = total + 1
    return total


def classify_apol1(genotypes):
    site1, site2, g2 = genotypes.lookup_variants(APOL1_QUERY_PLAN)

    if site1 is None and site2 is None and g2 is None:
        return "G-/G-"

    d_count = count_char(g2, "D")
    site1_variants = count_non_ref(site1, "A")
    site2_variants = count_non_ref(site2, "T")

    has_g1 = site1_variants > 0 and site2_variants > 0
    if has_g1:
        g1_total = site1_variants + site2_variants
    else:
        g1_total = 0

    if d_count == 2:
        return "G2/G2"
    if d_count == 1:
        if g1_total >= 2:
            return "G2/G1"
        return "G2/G0"
    if g1_total == 4:
        return "G1/G1"
    if g1_total >= 2:
        return "G1/G0"
    return "G0/G0"


def main():
    genotypes = bioscript.load_genotypes(input_file)
    status = classify_apol1(genotypes)
    rows = [{
        "participant_id": participant_id,
        "apol1_status": status,
    }]
    bioscript.write_tsv(output_file, rows)
    print(status)


if __name__ == "__main__":
    main()
