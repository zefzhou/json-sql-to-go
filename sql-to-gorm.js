const tableNamePattern = /(create).+\s(\w+\.)?\`?(\w+)\`?/i
const fieldPattern = /\`?(\w+)\`?\s+(tinyint|smallint|int|mediumint|bigint|float|double|decimal|varchar|char|text|mediumtext|longtext|datetime|time|date|enum|set|blob)(\([\d]+\))?([\w\s\'\.]+(default\s+)(\"|\')?([\+\-]?[^\s^\'^\"]*)(\"|\')?)?([\w\s]*(comment\s+[\"\'](.*)[\"\']))?/i

function sqlToGorm(sql, useJson, useMapStructure, useForm) {
    sql = sql.trim().replace(/ +/g, " ")
    var lines = sql.split('\n')
    if (!lines) {
        return {
            go: "",
            error: new Error("invalid sql")
        }
    }

    var types = getTypeMap(),
        structResult = 'type ',
        pk = [],
        unique = {},
        indexs = {},
        keys = sql.match(/((PRIMARY|UNIQUE)\s)?KEY\s([\`|\w|_]+\s)?\(\s*(\w|_|\`|,)+\s*\)/ig);

    if (keys != undefined && keys.length > 0) {
        var tmpFields = [];
        keys.forEach(function (k) {
            tmpFields = k.match(/[\`]?(\w|_)+[\`]?/g);
            for (var i = 0; i < tmpFields.length; i++) {
                tmpFields[i] = tmpFields[i].replace(/\`/g, '');
            }
            if (k.indexOf("PRIMARY KEY ") == 0 || k.indexOf("primary key ") == 0) {
                pk = tmpFields
            }

            if (k.indexOf("UNIQUE KEY") == 0 || k.indexOf("unique key") == 0) {
                for (var ii = 1; ii < tmpFields.length; ii++) {
                    if (unique[tmpFields[ii]] == undefined) {
                        unique[tmpFields[ii]] = [];
                    }
                    unique[tmpFields[ii]].push(tmpFields[0])
                }

            }

            if (k.indexOf("KEY") == 0 || k.indexOf("key") == 0) {
                for (var ii = 1; ii < tmpFields.length; ii++) {
                    if (indexs[tmpFields[ii]] == undefined) {
                        indexs[tmpFields[ii]] = [];
                    }
                    indexs[tmpFields[ii]].push(tmpFields[0])
                }
            }
        })
    }

    var shouldImportTimePkg = false
    var tbName, tbNameCamel
    for (var i = 0, len = lines.length; i < len; i++) {
        if (i == 0) {
            // parse table_name
            var field = lines[0].match(tableNamePattern)
            if (field && field[1] != undefined && field[3] != undefined) {
                tbName = field[3]
                tbNameCamel = titleCase(tbName)
                structResult += tbNameCamel + ' struct {'
                continue
            } else {
                return {
                    error: new Error("invalid sql")
                }
            }
        } else {
            if (lines[i].match(/(charset\s*=\s*)/i) != undefined) {
                continue
            }
            var field = lines[i].match(fieldPattern)
            // 1: field_name
            // 2: field_type
            // 8: default_val
            // 11: field_comment
            if (field && field[1] != undefined && field[2] != undefined) {
                if (types[field[2]] != undefined || types[field[2].toLowerCase()] != undefined) {
                    var fieldName = titleCase(field[1])
                    var fieldType = types[field[2]] || types[field[2].toLowerCase()]
                    var fieldJsonName = field[1].toLowerCase()
                    let comment = field[11]
                    if (fieldType == 'time.Time') {
                        shouldImportTimePkg = true
                    }
                    var omitempty = false
                    // field can be null
                    if ((lines[i].indexOf("NULL") >= 0 || lines[i].indexOf("null") >= 0) && lines[i].indexOf("NOT NULL") < 0 && lines[i].indexOf("not null") < 0) {
                        fieldType = "*" + fieldType
                        omitempty = true
                    }
                    structResult += '\n\t' + fieldName + ' ' + fieldType + ' '
                    var structArr = []
                    if (true) {
                        var gorm = ["column:" + fieldJsonName]

                        if (pk.indexOf(field[1]) >= 0) {
                            gorm.push("primary_key")
                        }

                        if (lines[i].indexOf("AUTO_INCREMENT") > 0 || lines[i].indexOf("auto_increment") > 0) {
                            gorm.push("auto_increment")
                        }

                        if (field[4] != undefined && field[5] != undefined && field[7] != undefined) {
                            gorm.push(`default:${field[7]}`)
                        }

                        structArr.push('gorm:"' + gorm.join(';') + '"')
                    }
                    if (useJson) {
                        var newFieldName = fieldJsonName
                        if (omitempty) {
                            newFieldName += ',omitempty'
                        }
                        structArr.push('json:"' + newFieldName + '"')
                    }
                    if (useMapStructure) {
                        structArr.push('mapstructure:"' + fieldJsonName + '"')
                    }
                    if (useForm) {
                        structArr.push('form:"' + fieldJsonName + '"')
                    }
                    if (structArr.length > 0) {
                        structResult += '`' + structArr.join(' ') + '`'
                    }
                    //append comment
                    if (comment != undefined) {
                        structResult += '   //' + comment
                    }
                } else {
                    continue
                }
            } else {
                continue
            }
        }
    }
    structResult += '\n}'

    // append package and imports
    var head = `package model

`
    if (shouldImportTimePkg) {
        head = `package model

import "time"

`}

    // append TableName func
    var nameFuncStr = `

func (m *${tbNameCamel}) TableName() string {
    return "${tbName}"
}
`

    structResult = head + structResult + nameFuncStr
    console.log(`${structResult}`)
    return {
        go: structResult
    }
}


function titleCase(str) {

    var array = str.toLowerCase().split("_"),
        upperArr = getUpperChar();

    for (var i = 0; i < array.length; i++) {
        if (upperArr.includes(array[i])) {
            array[i] = array[i].toUpperCase()
        } else {
            array[i] = array[i][0].toUpperCase() + array[i].substring(1, array[i].length);
        }
    }
    var string = array.join("");

    return string;
}


function getUpperChar() {
    return ["id", "ip", "api", "uid", "uuid"]
}

// type mapping
function getTypeMap() {
    return {
        'tinyint': 'int8',
        'smallint': 'int16',
        'int': 'int',
        'integer': 'int32',
        'mediumint': 'int64',
        'bigint': 'int64',
        'tinyint unsigned': 'uint8',
        'smallint unsigned': 'uint16',
        'integer unsigned': 'uint32',
        'bigint unsigned': 'uint64',
        'float': 'float32',
        'double': 'float64',
        'varchar': 'string',
        'text': 'string',
        'decimal': 'float64',
        'char': 'string',
        'mediumtext': 'string',
        'longtext': 'string',
        'time': 'time.Time',
        'date': 'time.Time',
        'datetime': 'time.Time',
        'timestramp': 'int64',
        'enum': 'string',
        'set': 'string',
        'blob': 'string'
    }
}

module.exports = sqlToGorm