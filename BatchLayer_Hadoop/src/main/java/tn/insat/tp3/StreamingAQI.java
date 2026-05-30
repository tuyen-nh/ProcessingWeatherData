package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.api.java.UDF1;
import org.apache.spark.sql.streaming.OutputMode;
import org.apache.spark.sql.streaming.StreamingQuery;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructType;

import static org.apache.spark.sql.functions.*;

public class StreamingAQI {

    public static void main(String[] args) throws Exception {
        // Initialize Spark Session
        SparkSession spark = SparkSession.builder()
                .appName("Vietnam AQI Real-Time Streaming")
                // master được truyền qua spark-submit --master spark://spark-master:7077
                // Reduce shuffle partitions to match cluster size (2 workers × 2 cores)
                .config("spark.sql.shuffle.partitions", "4")
                .getOrCreate();

        // 1. Defining the Schema for incoming Kafka JSON Data
        StructType jsonSchema = new StructType()
                .add("date", DataTypes.StringType)
                .add("timestamp", DataTypes.TimestampType)
                .add("station_id", DataTypes.StringType)
                .add("pm25", DataTypes.DoubleType)
                .add("temperature", DataTypes.DoubleType)
                .add("humidity", DataTypes.DoubleType)
                .add("no2", DataTypes.DoubleType);

        // 2. Read continuous stream from Kafka (internal Docker network)
        // Requirement 5: Structured Streaming
        Dataset<Row> kafkaStream = spark.readStream()
                .format("kafka")
                .option("kafka.bootstrap.servers", "kafka-0.kafka-headless.bigdata.svc.cluster.local:29092,kafka-1.kafka-headless.bigdata.svc.cluster.local:29092,kafka-2.kafka-headless.bigdata.svc.cluster.local:29092")
                .option("subscribe", "vn_weather_stream")
                .option("startingOffsets", "latest")
                .load();

        // Parse JSON from Kafka value
        Dataset<Row> parsedStream = kafkaStream
                .selectExpr("CAST(value AS STRING)")
                .select(from_json(col("value"), jsonSchema).alias("data"))
                .select("data.*");

        // 3. Load static Geography Data from HDFS (Distributed path)
        Dataset<Row> stationsDf = spark.read()
                .option("header", "true")
                .csv("hdfs://namenode:9000/user/data/static/vietnam_stations.csv");

        // Requirement 3: Broadcast Join (Highly Optimized)
        // Broadcasting the small CSV so all worker nodes check station_id instantly
        Dataset<Row> enrichedStream = parsedStream.join(broadcast(stationsDf), "station_id");

        // Requirement 2: Custom UDF to calculate actual AQI from PM2.5
        UDF1<Double, Integer> calculateAQI = (pm25) -> {
            if (pm25 == null) return 0;
            double c = pm25;
            if (c <= 12.0) return (int) Math.round((50.0 / 12.0) * c);
            if (c <= 35.4) return (int) Math.round(((100.0 - 51.0) / (35.4 - 12.1)) * (c - 12.1) + 51.0);
            if (c <= 55.4) return (int) Math.round(((150.0 - 101.0) / (55.4 - 35.5)) * (c - 35.5) + 101.0);
            if (c <= 150.4) return (int) Math.round(((200.0 - 151.0) / (150.4 - 55.5)) * (c - 55.5) + 151.0);
            if (c <= 250.4) return (int) Math.round(((300.0 - 201.0) / (250.4 - 150.5)) * (c - 150.5) + 201.0);
            if (c <= 350.4) return (int) Math.round(((400.0 - 301.0) / (350.4 - 250.5)) * (c - 250.5) + 301.0);
            if (c <= 500.4) return (int) Math.round(((500.0 - 401.0) / (500.4 - 350.5)) * (c - 350.5) + 401.0);
            return 500; // Hazardous/Beyond scale
        };
        spark.udf().register("pm25ToAQI", calculateAQI, DataTypes.IntegerType);

        // Requirement 5 & 1: Watermarking & Advanced Aggregations (Window Functions)
        // Moving Average of PM2.5 over a 15-minute window for each region
        // Watermarking discards data arriving more than 2 hours late.
        Dataset<Row> windowedAggregations = enrichedStream
                .withWatermark("timestamp", "2 hours")
                .groupBy(
                        window(col("timestamp"), "15 minutes"),
                        col("region")
                )
                .agg(
                        round(avg("pm25"), 2).alias("avg_pm25"),
                        max("pm25").alias("peak_pm25"),
                        round(avg("temperature"), 2).alias("avg_temp"),
                        round(avg("humidity"), 2).alias("avg_humidity"),
                        round(avg("no2"), 2).alias("avg_no2")
                );

        Dataset<Row> finalAggregations = windowedAggregations
                .withColumn("aqi_index", callUDF("pm25ToAQI", col("avg_pm25")));

        // Requirement 5: Manage state and Output Mode
        // format("mongo") does NOT support streaming sink directly -> use foreachBatch instead.
        StreamingQuery query = finalAggregations.writeStream()
                .outputMode(OutputMode.Update())
                .foreachBatch((batchDF, batchId) -> {
                    if (!batchDF.isEmpty()) {
                        batchDF.write()
                                .format("mongo")
                                .mode("append")
                                .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                                .option("spark.mongodb.output.database", "Big_Data")
                                .option("spark.mongodb.output.collection", "AQIStream")
                                .save();
                        System.out.println("Batch " + batchId + " written to MongoDB: " + batchDF.count() + " records.");
                    }
                })
                // Requirement 5: Exactly-once semantics via Checkpointing (trên HDFS cluster)
                .option("checkpointLocation", "hdfs://namenode:9000/checkpoints/aqi_stream_mongo")
                .start();

        query.awaitTermination();
    }
}
