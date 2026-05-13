env "local" {
  src = "file://internal/db/schema.sql"
  dev = "sqlite://dev?mode=memory"
  url = "sqlite://local.db"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}

env "prod" {
  src = "file://internal/db/schema.sql"
  dev = "sqlite://dev?mode=memory"
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}
