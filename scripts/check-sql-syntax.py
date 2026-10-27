"""
Offline syntax check of the pending migrations. Uses the PostgreSQL parser (pglast) only: it never connects to any
database. It parses every statement and, for plpgsql functions, the function body as well, so syntax errors in the
unapplied migrations are caught before they are run manually in the Supabase SQL Editor.

    python -m pip install pglast
    python scripts/check-sql-syntax.py            # all migrations from 20261026 onwards
    python scripts/check-sql-syntax.py path.sql   # specific files

This proves SYNTAX only. It does not prove the SQL does the right thing or that referenced objects exist; that needs a
real database (see docs/SELF_AUDIT_TEST_REPORT.md).
"""
import glob
import json
import os
import re
import sys

import pglast
from pglast import parse_plpgsql, parse_sql

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = sys.argv[1:] or sorted(glob.glob(os.path.join(root, 'supabase', 'migrations', '2026102[6-9]_*.sql')) + glob.glob(os.path.join(root, 'supabase', 'migrations', '202610[3-9]*_*.sql')) + glob.glob(os.path.join(root, 'supabase', 'migrations', '20261[1-9]*_*.sql')))
files = sorted(set(f for f in files if os.path.basename(f) >= '20261026'))

NL = chr(10)
# A declaration line such as:  v_old public.order_status;  or  v_x public.some_type := null;
DECLARE_LINE = re.compile(r'^(\s*\w+\s+)(?:public\.)?([a-z_]+)(\s*(?:;|:=|default))', re.M)
BUILTIN_TYPES = {
    'text', 'uuid', 'integer', 'int', 'bigint', 'smallint', 'numeric', 'boolean', 'date', 'timestamp', 'timestamptz',
    'jsonb', 'json', 'record', 'varchar', 'bytea', 'real', 'double', 'char', 'time', 'interval',
}


def reparse_with_scalar_types(statement_text):
    """Re-parse a function with every DECLAREd variable of a non-built-in type replaced by text."""
    lower = statement_text.lower()
    start = lower.find('declare')
    end = lower.find(NL + 'begin', start)
    if start < 0 or end < 0:
        return False
    block = statement_text[start:end]
    swapped = re.sub(
        DECLARE_LINE,
        lambda m: m.group(0) if m.group(2).lower() in BUILTIN_TYPES or m.group(2).lower() == 'declare' else m.group(1) + 'text' + m.group(3),
        block,
    )
    try:
        parse_plpgsql(statement_text[:start] + swapped + statement_text[end:])
        return True
    except Exception:  # noqa: BLE001
        return False


failures = 0
for path in files:
    name = os.path.basename(path)
    text = open(path, encoding='utf8').read()
    try:
        statements = parse_sql(text)
    except pglast.parser.ParseError as error:
        failures += 1
        print(f'FAIL {name}: {error}')
        continue
    plpgsql_bodies = 0
    problems = []
    for raw in statements:
        node = raw.stmt
        tag = type(node).__name__
        if tag == 'CreateFunctionStmt':
            options = {o.defname: o for o in (node.options or [])}
            language = options.get('language')
            body = options.get('as')
            if language is not None and body is not None and language.arg.sval.lower() == 'plpgsql':
                fname = '.'.join(n.sval for n in node.funcname)
                # Parse the real statement (with its real signature), so RETURN / NEW / INTO are checked in context.
                statement_text = text[raw.stmt_location: raw.stmt_location + raw.stmt_len] if raw.stmt_len else text[raw.stmt_location:]
                try:
                    parse_plpgsql(statement_text)
                    plpgsql_bodies += 1
                except Exception as error:  # noqa: BLE001
                    if 'record variable cannot be part of multiple-item INTO' in str(error) and reparse_with_scalar_types(statement_text):
                        # The offline parser has no catalogue, so a variable of a user-defined type (an enum such as
                        # order_status) used as one of several SELECT ... INTO targets is mistaken for a record. PostgreSQL
                        # itself knows the type is a scalar. Declared types are swapped for text and the body re-parsed:
                        # if THAT passes, the only complaint was this limitation. Any other error still fails.
                        print(f'     note {name}: {fname}: parser limitation (enum variables in a multi-item INTO), body parses with scalar types')
                        plpgsql_bodies += 1
                    else:
                        problems.append(f'plpgsql body of {fname}: {error}')
        elif tag == 'DoStmt':
            for option in node.args or []:
                if option.defname == 'as':
                    try:
                        parse_plpgsql(f'DO $q${option.arg.sval}$q$;') if False else parse_plpgsql(f'CREATE FUNCTION _do_block() RETURNS void AS $q${option.arg.sval}$q$ LANGUAGE plpgsql;')
                        plpgsql_bodies += 1
                    except Exception as error:  # noqa: BLE001
                        problems.append(f'DO block: {error}')
    if problems:
        failures += 1
        print(f'FAIL {name}:')
        for p in problems:
            print('   ', p)
    else:
        print(f'ok   {name}: {len(statements)} statements, {plpgsql_bodies} plpgsql bodies parsed')

print()
print('RESULT:', 'all migrations parse' if failures == 0 else f'{failures} file(s) with problems')
sys.exit(1 if failures else 0)
