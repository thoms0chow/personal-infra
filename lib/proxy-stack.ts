import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Peer, Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import {
  Cluster, ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition, LogDrivers,
  Secret
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";

export interface ProxyStackProps extends StackProps {
  vpc: Vpc;
}

export class ProxyStack extends Stack {
  constructor(scope: Construct, id: string, props: ProxyStackProps) {
    super(scope, id, props);

    // Common settings
    const resourceName = "PersonalProxyStack";

    // #region ECS
    const proxyClusterName = resourceName + "-Proxy-Cluster";
    const proxyCluster = new Cluster(this, proxyClusterName, {
      clusterName: proxyClusterName,
      vpc: props.vpc,
    });

    const proxyTaskDef = new FargateTaskDefinition(
      this,
      `${resourceName}-Proxy-FargateTaskDefinition`,
      {
        runtimePlatform: {
          cpuArchitecture: CpuArchitecture.ARM64,
        },
      }
    );

    const proxyContainerLogGroup = new LogGroup(
      this,
      `${resourceName}-Proxy-LogGroup`,
      {
        logGroupName: "/aws/ecs/proxy",
        retention: RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    proxyTaskDef.addContainer(`${resourceName}-Proxy-Container`, {
      image: ContainerImage.fromAsset(path.join(__dirname, "proxy")),
      containerName: "proxy",
      secrets: {
        SS_ALGORITHM: Secret.fromSsmParameter(
          StringParameter.fromSecureStringParameterAttributes(
            this,
            `${resourceName}-Proxy-Algo`,
            {
              parameterName: "/proxy/SS_ALGORITHM",
            }
          )
        ),
        SS_PASSWORD: Secret.fromSsmParameter(
          StringParameter.fromSecureStringParameterAttributes(
            this,
            `${resourceName}-Proxy-Password`,
            {
              parameterName: "/proxy/SS_PASSWORD",
            }
          )
        ),
      },
      logging: LogDrivers.awsLogs({
        streamPrefix: "proxy",
        logGroup: proxyContainerLogGroup,
      }),
    });

    const proxyServiceSecurityGroup = new SecurityGroup(
      this,
      `${resourceName}-Proxy-SecurityGroup`,
      {
        vpc: props.vpc,
      }
    );
    proxyServiceSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8388));
    proxyServiceSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.udp(8388));

    const proxyServiceName = `${resourceName}-Proxy-Service`;
    const proxyService = new FargateService(this, proxyServiceName, {
      serviceName: proxyServiceName,
      cluster: proxyCluster,
      taskDefinition: proxyTaskDef,
      desiredCount: 1,
      securityGroups: [proxyServiceSecurityGroup],
      assignPublicIp: true,
    });

    // #endregion
  }
}
