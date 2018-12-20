const idolAttributes = require("../../config/idolAttributes");
const Service = require('egg').Service;

class IdolService extends Service {
    async getIdol(tokenId, userId) {
        const ctx = this.ctx;
        let sql;
        if (userId > 0)
            sql = 'SELECT i.TokenId, NickName, i.UserId, Genes, BirthTime, Bio, Generation, Pic, Cooldown, MatronId, SireId,ul.Id AS LikeId FROM idols i '
                + 'LEFT OUTER JOIN userlikes ul ON i.TokenId=ul.TokenId AND ul.UserId=:UserId '
                + 'WHERE i.TokenId=:TokenId';
        else
            sql = 'SELECT TokenId, NickName, UserId, Genes, BirthTime, Bio, Generation, Pic, Cooldown, MatronId, SireId, 0 AS LikeId FROM idols '
                + 'WHERE TokenId=:TokenId';

        let idols = await ctx.model.query(sql, { raw: true, model: ctx.model.IdolModel, replacements: { TokenId: tokenId, UserId: userId } });
        if (idols != null && idols.length > 0) {
            return idols[0];
        }
        return null;
    };

    async getIdolList(userId, category, hairColors, eyeColors, hairStyles, attributes, filters, sort, offset, limit) {
        let isForSale = 0;
        let isRental = 0;

        if (category == "forsale")
            isForSale = 1;

        if (category == "rental")
            isRental = 1;

        //?category=new&sort=price&attributes=hasname,hasbio,cooldownready,dark skin,blush,smile,open mouth,hat,ribbon,glasses
        //&filters=iteration:1~2,cooldown:ur|ssr|sr|r|n,price:1~2,liked:0x834721d79edcf0851505bf47c605607030b086c1

        const ctx = this.ctx;
        let sql = 'SELECT TokenId, NickName, UserId, Genes, BirthTime, Bio, Generation, Pic, Cooldown, MatronId, SireId '
            + 'FROM idols '
            + 'WHERE (0=:userId OR UserId=:userId) '
            + 'AND (0=:isForSale OR IsForSale=:isForSale) '
            + 'AND (0=:isRental OR IsRental=:isRental) ';


        //已做检查防止sql注入
        if (hairColors != undefined) {
            let sqlHairColors = "AND HairColor IN (";
            hairColors.split(",").forEach(color => {
                if (idolAttributes.HairColors.indexOf(color) >= 0) {
                    sqlHairColors += "'" + color + "',";
                }
            });
            sqlHairColors = sqlHairColors.substring(0, sqlHairColors.lastIndexOf(","));
            sqlHairColors += ") ";
            sql += sqlHairColors;
        }

        if (eyeColors != undefined) {
            let sqlEyeColors = "AND EyeColor IN (";
            eyeColors.split(",").forEach(color => {
                if (idolAttributes.EyeColors.indexOf(color) >= 0) {
                    sqlEyeColors += "'" + color + "',";
                }
            });
            sqlEyeColors = sqlEyeColors.trimRight(",");
            sqlEyeColors = sqlEyeColors.substring(0, sqlEyeColors.lastIndexOf(","));
            sqlEyeColors += ") ";
            sql += sqlEyeColors;
        }

        if (hairStyles != undefined) {
            let sqlHairStyles = "AND HairStyle IN (";
            hairStyles.split(",").forEach(style => {
                if (idolAttributes.HairStyles.indexOf(style) >= 0) {
                    sqlHairStyles += "'" + style + "',";
                }
            });
            sqlHairStyles = sqlHairStyles.substring(0, sqlHairStyles.lastIndexOf(","));
            sqlHairStyles += ") ";
            sql += sqlHairStyles;
        }

        let attrs;
        let cooldownready = 0; //冷却就绪
        let hasname = 0; //已命名
        let hasbio = 0; //已有简介
        let characteristics = new Array(); //特征

        if (attributes != undefined)
            attrs = attributes.split(",");

        for (var i = 0; i < attrs.length; i++) {
            if (attrs[i] == "cooldownready") {
                cooldownready = 1;
                continue;
            }

            if (attrs[i] == "hasname") {
                hasname = 1;
                continue;
            }
            if (attrs[i] == "hasbio") {
                hasbio = 1;
                continue;
            }

            if (idolAttributes.Attributes.indexOf(attrs[i]) >= 0) {
                characteristics.push(attrs[i]);
                continue;
            }
        }

        //代，冷却速度，价格，like
        let conditions = filters.split(",");

        let iterationStart = 0;
        let iterationEnd = 999999
        let cooldowns; //冷却速度
        let priceStart = 0;
        let priceEnd;
        let likeAddress;

        for (var i = 1; i < conditions.length; i++) {
            var conditionX = conditions[i].split(":");
            switch (conditionX[0]) {
                case "iteration":
                    let iterations = conditionX[1].split("~");
                    iterationStart = parseInt(iterations[0]);
                    iterationEnd = iterations.length > 1 ? parseInt(iterations[1]) : 999999;
                    break;
                case "cooldown":
                    cooldowns = conditionX[1].split("|");
                    break;
                case "price":
                    let prices = conditionX[1].split("~");
                    priceStart = parseFloat(prices[0]);
                    if (prices.length > 1) {
                        priceEnd = parseFloat(prices[1]);
                    }
                    break;
                case "liked":
                    likeAddress = conditionX[1];
                    break;
            }
        }

        //代
        sql += " AND Generation>=" + iterationStart + " AND Generation<=" + iterationEnd; //已做整形转换，防止sql注入

        //冷却速度 todo

        //价格

        //排序
        switch (sort) {
            case "id":
                sql += ' ORDER BY TokenId ';
                break;
            case "-id":
                sql += ' ORDER BY TokenId DESC ';
                break;

            case "iteration":
                sql += ' ORDER BY CreateDate ';
                break;
            case "-iteration":
                sql += ' ORDER BY CreateDate DESC ';
                break;

            //价格

            case "name":
                sql += ' ORDER BY NickName ';
                break;
            case "-name":
                sql += ' ORDER BY NickName DESC ';
                break;

            case "cooldown":
                sql += ' ORDER BY Cooldown ';
                break;
            case "-liked":  //人气，like点赞数量
                sql += ' ORDER BY LikeCount DESC ';
                break;
            case "newauction": //追加时间
                sql += ' ORDER BY CreateDate DESC ';
                break;
        }

        + 'LIMIT :offset, :limit ';
        let idols = await ctx.model.query(sql, { raw: true, model: ctx.model.IdolModel, replacements: { userId, isForSale, isRental, offset, limit } });

        return idols;
    }

    async like(userId, tokenId) {
        let sql = 'START TRANSACTION; '
            + 'UPDATE idols SET LikeCount=LikeCount+1 WHERE TokenId=:TokenId AND NOT EXISTS ( SELECT 1 FROM userlikes WHERE TokenId=:TokenId AND UserId=:UserId); '
            + 'INSERT INTO userlikes (UserId, TokenId, CreateDate) '
            + ' SELECT :TokenId, :UserId, UNIX_TIMESTAMP() FROM DUAL WHERE ROW_COUNT() > 0;'
            + 'COMMIT';
        let idols = await this.ctx.model.query(sql, { raw: true, replacements: { UserId: userId, TokenId: tokenId } });
    }

    async unlike(userId, tokenId) {
        let sql = 'START TRANSACTION; '
            + 'DELETE FROM userlikes WHERE TokenId=:TokenId AND UserId=:TokenId; '
            + 'UPDATE idols SET LikeCount=LikeCount-1 WHERE TokenId=:TokenId AND ROW_COUNT() > 0;'
            + 'COMMIT';
        let idols = await this.ctx.model.query(sql, { raw: true, replacements: { UserId: userId, TokenId: tokenId } });
    }

}

module.exports = IdolService;