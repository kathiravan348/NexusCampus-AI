"""Value checks equal to `frontend/packages/contracts/src/common.ts` (which uses the browser's `Intl`).

Python has no `Intl`, so: locales by the canonical BCP 47 shape, time zones by `zoneinfo` (tzdata), currencies
and countries by the ISO 4217 / ISO 3166-1 code lists below.
"""

import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_LOCALE = re.compile(
    r"^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([0-9A-Za-z]{5,8}|[0-9][0-9A-Za-z]{3}))*$"
)
_ZONE = re.compile(r"^(UTC|[A-Z][A-Za-z_]*(/[A-Z0-9][A-Za-z0-9_+-]*){1,2})$")

_ISO_4217 = """AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP
    BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR
    FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES
    KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR
    MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF
    SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD
    TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XCD XDR XOF XPF XSU XUA YER ZAR ZMW
    ZWG ZWL"""
CURRENCIES = frozenset(_ISO_4217.split())

_ISO_3166 = """AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
    BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
    EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
    HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
    LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
    NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
    SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
    TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"""
COUNTRIES = frozenset(_ISO_3166.split())


def is_locale(value: str) -> bool:
    return bool(_LOCALE.fullmatch(value))


def is_time_zone(value: str) -> bool:
    if not _ZONE.fullmatch(value):
        return False
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def is_currency(value: str) -> bool:
    return value in CURRENCIES


def is_country(value: str) -> bool:
    return value in COUNTRIES


def check(predicate: bool, message: str) -> None:
    """For Pydantic `field_validator`s: raise the contract's message when `predicate` is false."""
    if not predicate:
        raise ValueError(message)
