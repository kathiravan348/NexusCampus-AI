"""M14 families, guardians and authorised pickups (NEX-202)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0027_families"
down_revision: str | None = "0026_learner_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("households", "guardian_relationships", "authorised_pickups")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION m14_person_ids_valid(ids varchar[], minimum integer, maximum integer)
        RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT cardinality(ids) BETWEEN minimum AND maximum
             AND coalesce(array_ndims(ids), 1) = 1
             AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) AS u(id) WHERE length(id) > 0)
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION m14_address_valid(a jsonb)
        RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT CASE WHEN jsonb_typeof(a) <> 'object' THEN false ELSE
            a ?& ARRAY['line1','city','countryCode']
            AND a - ARRAY['line1','line2','city','region','postalCode','countryCode'] = '{}'::jsonb
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_each(a) AS p(k,v)
              CROSS JOIN LATERAL (SELECT regexp_replace(v #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g'))
                AS trimmed(value)
              WHERE jsonb_typeof(v) <> 'string'
                 OR length(trimmed.value) > CASE k WHEN 'line1' THEN 200 WHEN 'line2' THEN 200
                      WHEN 'city' THEN 100 WHEN 'region' THEN 100 WHEN 'postalCode' THEN 20 ELSE 2 END
                 OR (k IN ('line1','city') AND trimmed.value = '')
            )
            AND (a->>'countryCode') = ANY(string_to_array(
                'AC AD AE AF AG AI AL AM AN AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL '
                'BM BN BO BQ BR BS BT BU BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CP CQ CR CS '
                'CU CV CW CX CY CZ DD DE DG DJ DK DM DO DY DZ EA EC EE EG EH ER ES ET FI FJ FK FM FO '
                'FR FX GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU HV '
                'IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB '
                'LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV '
                'MW MX MY MZ NA NC NE NF NG NH NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR '
                'PS PT PW PY QA RE RH RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST '
                'SU SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TP TR TT TV TW TZ UA UG UK UM US '
                'UY UZ VA VC VD VE VG VI VN VU WF WS XK YD YE YT YU ZA ZM ZR ZW', ' '))
          END
        $$
        """
    )
    op.create_table(
        "households",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", JSONB(none_as_null=True), nullable=True),
        sa.Column("learner_person_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("guardian_person_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("primary_language", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.CheckConstraint("name ~ '[^[:space:]]'", name="name_present"),
        sa.CheckConstraint("m14_address_valid(address)", name="address_valid"),
        sa.CheckConstraint("m14_person_ids_valid(learner_person_ids, 1, 20)", name="learners_valid"),
        sa.CheckConstraint("m14_person_ids_valid(guardian_person_ids, 0, 10)", name="guardians_valid"),
        # Match nexus.core.validation.is_locale, including script, region and variant subtags.
        sa.CheckConstraint(
            """primary_language COLLATE "C" ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?"""
            "(-([0-9A-Za-z]{5,8}|[0-9][0-9A-Za-z]{3}))*$'",
            name="locale_valid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )

    op.create_table(
        "guardian_relationships",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("guardian_person_id", sa.String(ID), nullable=False),
        sa.Column("learner_person_id", sa.String(ID), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("parental_responsibility", sa.Boolean(), nullable=False),
        sa.Column("lives_with_learner", sa.Boolean(), nullable=False),
        sa.Column("contact_priority", sa.Integer(), nullable=False),
        sa.Column("pickup_right", sa.String(16), nullable=False),
        sa.Column("court_order_note", sa.Text(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["guardian_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.CheckConstraint("guardian_person_id <> learner_person_id", name="different_people"),
        sa.CheckConstraint(
            "kind IN ('mother','father','parent','step_parent','grandparent','legal_guardian',"
            "'foster_carer','adult_sibling','other')",
            name="kind_valid",
        ),
        sa.CheckConstraint("contact_priority BETWEEN 1 AND 10", name="priority_valid"),
        sa.CheckConstraint("pickup_right IN ('allowed','not_allowed','court_restricted')", name="right_valid"),
        sa.CheckConstraint(
            "(court_order_note IS NOT NULL) = (pickup_right = 'court_restricted')",
            name="note_present",
        ),
        sa.CheckConstraint("court_order_note ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'", name="note_encrypted"),
        sa.CheckConstraint("effective_to >= effective_from", name="dates_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index(
        "ix_guardian_relationships_learner", "guardian_relationships", ["tenant_id", "learner_person_id", "id"]
    )

    op.create_table(
        "authorised_pickups",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("learner_person_id", sa.String(ID), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("relationship_label", sa.String(60), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("added_by_person_id", sa.String(ID), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["learner_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(["added_by_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.CheckConstraint("name ~ '[^[:space:]]'", name="name_present"),
        sa.CheckConstraint("phone ~ '^[+][1-9][0-9]{6,14}$'", name="phone_valid"),
        sa.CheckConstraint("relationship_label ~ '[^[:space:]]'", name="label_present"),
        sa.CheckConstraint("valid_to >= valid_from", name="dates_valid"),
    )
    op.create_index("ix_authorised_pickups_learner", "authorised_pickups", ["tenant_id", "learner_person_id", "id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"REVOKE ALL ON {table} FROM nexus_app")
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m14_address_valid(jsonb)")
    op.execute("DROP FUNCTION m14_person_ids_valid(varchar[], integer, integer)")
